import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { OutboundService } from './outbound.service';
import type { NotificationType } from '@nexakabi/contracts';

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

/** Types qu'aucune préférence ne peut désactiver. */
const MANDATORY: readonly NotificationType[] = ['PAYMENT_CONFIRMED', 'EVENT_UPDATED'];

/**
 * Notifications aux participants.
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
   * Le participant accepte-t-il ce type ?
   *
   * Les types transactionnels passent sans consultation : ils portent un billet
   * ou une annulation. Le reste dépend d'une ligne de préférences qui peut ne
   * pas exister — l'absence vaut alors les valeurs par défaut du schéma.
   */
  private async isAllowed(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    type: NotificationType,
  ): Promise<boolean> {
    if (MANDATORY.includes(type)) return true;

    const preference = await client.notificationPreference.findUnique({
      where: { userId },
      select: { eventReminders: true, organizerPublications: true },
    });

    switch (type) {
      case 'EVENT_REMINDER':
        // Absent = actif. Les rappels rendent service, et quelqu'un qui n'a
        // jamais ouvert ses réglages n'a pas exprimé de refus.
        return preference?.eventReminders ?? true;
      case 'ORGANIZER_PUBLISHED':
        // Absent = inactif. C'est le seul type que le participant ne déclenche
        // pas lui-même : il doit l'avoir demandé.
        return preference?.organizerPublications ?? false;
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
   */
  async markRead(userId: string, notificationIds?: string[]): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(notificationIds?.length ? { id: { in: notificationIds } } : {}),
      },
      data: { readAt: new Date() },
    });

    return { count: result.count };
  }

  /** Préférences, avec les valeurs par défaut si la ligne n'existe pas encore. */
  async getPreferences(userId: string): Promise<{
    eventReminders: boolean;
    organizerPublications: boolean;
    whatsapp: boolean;
    sms: boolean;
    email: boolean;
  }> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        eventReminders: true,
        organizerPublications: true,
        whatsapp: true,
        sms: true,
        email: true,
      },
    });

    return (
      preference ?? {
        eventReminders: true,
        organizerPublications: false,
        whatsapp: true,
        sms: true,
        email: false,
      }
    );
  }

  async updatePreferences(
    userId: string,
    patch: Partial<{
      eventReminders: boolean;
      organizerPublications: boolean;
      whatsapp: boolean;
      sms: boolean;
      email: boolean;
    }>,
  ): Promise<void> {
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
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
