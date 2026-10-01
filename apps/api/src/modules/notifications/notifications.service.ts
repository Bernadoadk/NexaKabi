import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isMandatory,
  type NotificationPreferences,
  type NotificationType,
} from '@nexakabi/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { OutboundService } from './outbound.service';

export interface CreateNotificationInput {
  readonly userId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  /** Chemin interne. Une contrainte en base refuse les URL absolues. */
  readonly actionUrl: string;
  readonly actionLabel: string;
  readonly eventId?: string;
  readonly orderId?: string;
  /** Empreinte d'unicité, pour qu'un balayage répété n'envoie pas deux fois. */
  readonly dedupeKey?: string;
}

/**
 * Notifications aux participants — et aux organisations.
 *
 * ── Deux garanties, et leur coût ────────────────────────────────────────────
 *  · **Rien n'est envoyé deux fois.** `dedupeKey` porte un index unique par
 *    destinataire : un balayage qui repasse, un webhook rejoué, un clic sur
 *    « renvoyer » — tous retombent sur la même ligne. La violation d'unicité
 *    n'est pas une erreur ici, c'est le mécanisme lui-même.
 *  · **Une notification ne bloque jamais ce qui l'a produite.** Un opérateur
 *    SMS injoignable ne doit pas faire échouer un paiement confirmé. Les envois
 *    sortants sont donc détachés de la transaction métier, et leurs échecs sont
 *    journalisés plutôt que propagés.
 *
 * Ces deux garanties tirent dans des directions opposées : la première veut la
 * transaction, la seconde la refuse. Le compromis retenu — écrire la
 * notification DANS la transaction, diffuser APRÈS — est décrit sur `notify`.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: OutboundService,
  ) {}

  /**
   * Crée une notification et déclenche sa diffusion.
   *
   * ── Pourquoi `tx` est facultatif ──────────────────────────────────────────
   * Quand un appelant fournit sa transaction — le paiement, typiquement — la
   * notification est écrite avec lui : si l'encaissement échoue, aucune trace
   * ne subsiste d'un billet qui n'existe pas. La DIFFUSION, elle, ne peut pas
   * attendre la transaction sans la retenir ; elle part après, et le journal
   * `MessageLog` porte son sort.
   *
   * Conséquence assumée : entre le commit et la diffusion, la notification
   * existe en base sans être partie. Un balayage de rattrapage la reprendra.
   * L'inverse — diffuser avant le commit — enverrait « ton paiement est
   * confirmé » pour un paiement qui ne l'est pas.
   */
  async notify(
    input: CreateNotificationInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; created: boolean }> {
    const client = tx ?? this.prisma;

    const allowed = await this.isAllowed(client, input.userId, input.type);

    if (!allowed) {
      // Le participant a désactivé ce type. Ne rien écrire du tout : une
      // notification non lue reste une notification, et le centre se remplirait
      // de ce qu'il a explicitement refusé.
      return { id: '', created: false };
    }

    /**
     * ── Pourquoi cette lecture précède l'écriture ─────────────────────────
     * Elle n'est pas une optimisation : c'est la SEULE protection utilisable
     * quand `notify` est appelé dans la transaction d'un encaissement.
     *
     * Dans une transaction PostgreSQL, une violation d'unicité avorte tout —
     * le `catch` plus bas s'exécuterait bien, mais chaque requête suivante
     * échouerait en `25P02`, et l'encaissement entier serait perdu à cause
     * d'un webhook rejoué. La lecture préalable évite d'en arriver là.
     *
     * Le `catch` reste utile hors transaction, pour la course entre deux
     * appels simultanés — un cas que cette lecture ne couvre pas.
     */
    const existing = input.dedupeKey
      ? await client.notification.findUnique({
          where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
          select: { id: true },
        })
      : null;

    if (existing) {
      return { id: existing.id, created: false };
    }

    try {
      const notification = await client.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          actionUrl: input.actionUrl,
          actionLabel: input.actionLabel,
          eventId: input.eventId,
          orderId: input.orderId,
          dedupeKey: input.dedupeKey,
        },
        select: { id: true },
      });

      // Détaché : la diffusion ne retient pas l'appelant, et son échec ne
      // remonte pas. `OutboundService` journalise tout dans `MessageLog`.
      this.outbound.schedule(notification.id);

      return { id: notification.id, created: true };
    } catch (error) {
      // Course entre deux appels SIMULTANÉS portant la même empreinte, hors
      // transaction. Le perdant n'a rien à signaler : le gagnant a fait le
      // travail. Voir la note sur la lecture préalable pour le cas
      // transactionnel, que ce rattrapage ne couvre pas.
      if (isUniqueViolation(error)) {
        return { id: '', created: false };
      }

      throw error;
    }
  }

  /**
   * Crée une notification, ou met à jour celle que la même empreinte a déjà produite.
   *
   * ── Pour les séries, pas pour les événements ponctuels ────────────────────
   * `notify` ignore un doublon : une annonce d'annulation ne se renvoie pas. Une
   * SÉRIE est autre chose — les ventes d'un événement pendant dix minutes font
   * une seule ligne au centre, dont le texte grossit à chaque vente. L'appelant
   * recalcule le message depuis ses données, et cette méthode le pose sur la
   * ligne existante : elle la remet en non lue, la remonte en tête, et relance
   * la diffusion — qui décide elle-même, selon la politique du type, de sonner
   * ou de se contenter de mettre l'affichage à jour.
   *
   * Hors transaction, donc : une mise à jour qui échouerait ne doit pas emporter
   * avec elle l'encaissement qui l'a déclenchée.
   */
  async upsertSummary(
    input: CreateNotificationInput & { dedupeKey: string },
  ): Promise<{ id: string; created: boolean }> {
    if (!(await this.isAllowed(this.prisma, input.userId, input.type))) {
      return { id: '', created: false };
    }

    const refresh = async (): Promise<string | null> => {
      const existing = await this.prisma.notification.findUnique({
        where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
        select: { id: true },
      });

      if (!existing) return null;

      await this.prisma.notification.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          body: input.body,
          actionUrl: input.actionUrl,
          actionLabel: input.actionLabel,
          readAt: null,
          createdAt: new Date(),
        },
      });

      this.outbound.schedule(existing.id);
      return existing.id;
    };

    const updated = await refresh();
    if (updated) return { id: updated, created: false };

    const created = await this.notify(input);
    if (created.created) return created;

    // Course : un appel simultané a écrit la ligne entre notre lecture et notre
    // écriture. Son texte peut déjà être dépassé : on le remet à jour.
    const raced = await refresh();
    return { id: raced ?? '', created: false };
  }

  /**
   * Le participant accepte-t-il ce type ?
   *
   * Les types transactionnels passent sans consultation : ils portent un billet,
   * une annulation, un remboursement, une décision ou un retrait — la liste se
   * lit dans `NOTIFICATION_POLICY`. Le reste dépend d'une ligne de préférences
   * qui peut ne pas exister — l'absence vaut alors les valeurs par défaut du
   * schéma.
   */
  private async isAllowed(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    type: NotificationType,
  ): Promise<boolean> {
    if (isMandatory(type)) return true;

    const preference = await client.notificationPreference.findUnique({
      where: { userId },
      select: {
        eventReminders: true,
        organizerPublications: true,
        recommendations: true,
        salesAlerts: true,
      },
    });

    switch (type) {
      case 'EVENT_REMINDER':
        // Absent = actif. Les rappels rendent service, et quelqu'un qui n'a
        // jamais ouvert ses réglages n'a pas exprimé de refus.
        return preference?.eventReminders ?? DEFAULT_NOTIFICATION_PREFERENCES.eventReminders;
      case 'ORGANIZER_PUBLISHED':
        // Absent = actif : suivre un organisateur EST la demande.
        return (
          preference?.organizerPublications ??
          DEFAULT_NOTIFICATION_PREFERENCES.organizerPublications
        );
      case 'RECOMMENDATION':
        // Absent = inactif. C'est le seul type que rien, dans ce que le
        // participant a fait, ne réclame : il doit l'avoir demandé.
        return preference?.recommendations ?? DEFAULT_NOTIFICATION_PREFERENCES.recommendations;
      case 'SALE_RECEIVED':
      case 'SOLD_OUT':
        // Absent = actif : vendre des billets, c'est vouloir savoir qu'ils partent.
        return preference?.salesAlerts ?? DEFAULT_NOTIFICATION_PREFERENCES.salesAlerts;
      default:
        return true;
    }
  }

  /** Notifications d'un participant, les plus récentes d'abord. */
  async list(
    userId: string,
    options: { limit?: number; unreadOnly?: boolean } = {},
  ): Promise<{
    items: {
      id: string;
      type: NotificationType;
      title: string;
      body: string;
      actionUrl: string;
      actionLabel: string;
      readAt: string | null;
      createdAt: string;
    }[];
    unreadCount: number;
  }> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: Math.min(options.limit ?? 30, 100),
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          actionUrl: true,
          actionLabel: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      items: rows.map((row) => ({
        ...row,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount,
    };
  }

  /**
   * Marque comme lues.
   *
   * `updateMany` avec `readAt: null` en filtre : repasser sur une notification
   * déjà lue ne doit pas décaler sa date de lecture.
   *
   * Renvoie aussi ce qui reste non lu : le toucher d'une notification sur
   * l'appareil passe par ici, et le worker s'en sert pour remettre à jour la
   * pastille de l'icône sans une seconde requête.
   */
  async markRead(
    userId: string,
    notificationIds?: string[],
  ): Promise<{ count: number; unreadCount: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(notificationIds?.length ? { id: { in: notificationIds } } : {}),
      },
      data: { readAt: new Date() },
    });

    const unreadCount = await this.prisma.notification.count({ where: { userId, readAt: null } });

    return { count: result.count, unreadCount };
  }

  /** Préférences, avec les valeurs par défaut si la ligne n'existe pas encore. */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        eventReminders: true,
        organizerPublications: true,
        recommendations: true,
        salesAlerts: true,
        whatsapp: true,
        sms: true,
        email: true,
      },
    });

    return preference ?? { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  async updatePreferences(userId: string, patch: Partial<NotificationPreferences>): Promise<void> {
    // Un champ absent du correctif reste tel quel : `upsert` ne reçoit que ce
    // qui a bougé, jamais une valeur par défaut qui écraserait un choix.
    const data = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<NotificationPreferences>;

    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    this.logger.log(`Préférences de notification mises à jour pour ${userId}`);
  }
}

/** Même détection que dans les commandes : l'adaptateur driver ne renvoie pas
 *  toujours une instance de la classe d'erreur Prisma, seulement sa forme. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
