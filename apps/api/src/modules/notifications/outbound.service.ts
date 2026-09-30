import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { waitUntil } from '@vercel/functions';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isMandatory,
  type NotificationChannel,
  type NotificationType,
  type PlatformNotificationSettings,
} from '@nexakabi/contracts';
import type { Env } from '../../config/env';
import { publicWebUrl } from '../../config/public-urls';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EmailProvider, type EmailAttachment } from './email.provider';
import { renderNotificationEmail } from './email-layout';
import { PlatformSettingsService } from './platform-settings.service';
import { PushService } from './push.service';
import { SmsProvider } from './sms.provider';

/**
 * Diffusion sortante des notifications.
 *
 * ── Le participant choisit ses canaux ───────────────────────────────────────
 * Tout arrive dans le centre de notifications : c'est gratuit, immédiat, et
 * consultable hors ligne. Au-delà, c'est le participant qui décide, dans ses
 * réglages, par où il veut AUSSI être prévenu :
 *
 *   · **l'appareil** (Web Push) — pour chaque type qu'il a gardé actif, dès
 *     qu'un navigateur l'a autorisé ;
 *   · **l'e-mail** — même règle, s'il a donné une adresse ;
 *   · **WhatsApp** — même règle, sauf si la plateforme l'a coupé pour les
 *     messages non urgents (console, « Réglages des envois ») : un WhatsApp
 *     coûte à chaque envoi, et c'est à elle d'arbitrer ce qu'elle paie.
 *
 * ── Le SMS, un secours et rien d'autre ──────────────────────────────────────
 * Il ne porte que les messages critiques — un paiement confirmé (le billet),
 * une annulation (un déplacement pour rien) — et seulement quand WhatsApp est
 * refusé. Il arrive partout, y compris sur les téléphones à touches encore
 * courants hors de Cotonou ; il coûte aussi à chaque message, et un rappel ou
 * une sélection n'en valent pas le prix.
 *
 * ── Un seul canal téléphonique par notification ─────────────────────────────
 * Envoyer le même message par SMS ET WhatsApp double le coût pour ne rien
 * apporter : le participant l'a déjà lu.
 */
@Injectable()
export class OutboundService implements OnApplicationShutdown {
  private readonly logger = new Logger(OutboundService.name);

  /**
   * Diffusions parties mais pas encore terminées.
   *
   * ── Pourquoi les suivre ───────────────────────────────────────────────────
   * `schedule` lance la diffusion sans l'attendre, et sans ce registre plus
   * rien ne sait qu'elle est en cours. Deux conséquences, découvertes l'une
   * après l'autre :
   *
   *  · À l'arrêt du processus, un déploiement coupe la connexion au milieu
   *    d'un envoi. Le journal reste sur `QUEUED` et la reprise le rejouera —
   *    au mieux un doublon, au pire un message perdu.
   *  · En test, la diffusion écrit dans `message_log` pendant que le test
   *    suivant vide les tables. PostgreSQL a répondu par un interblocage.
   *
   * Le second symptôme a révélé le premier. `drain()` répond aux deux.
   */
  private readonly inFlight = new Set<Promise<void>>();

  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsProvider,
    private readonly email: EmailProvider,
    private readonly push: PushService,
    private readonly settings: PlatformSettingsService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = publicWebUrl(config);
  }

  /**
   * Programme la diffusion, sans la retenir.
   *
   * Ne renvoie rien et ne lève jamais : l'appelant est en train de confirmer un
   * paiement ou de publier un événement, et un opérateur injoignable ne doit
   * pas faire échouer ces opérations. Le sort de l'envoi vit dans `MessageLog`.
   *
   * ── Pourquoi `waitUntil` ──────────────────────────────────────────────────
   * Sur Vercel, une instance peut être suspendue dès la réponse envoyée : une
   * diffusion simplement « lancée » y mourait avant d'avoir écrit la moindre
   * ligne de journal — et la reprise, qui part des journaux, ne la voyait
   * jamais. `waitUntil` garde l'instance en vie jusqu'à la fin de l'envoi ;
   * ailleurs, il ne fait rien.
   *
   * ── Pourquoi pas une file de messages ─────────────────────────────────────
   * Redis + BullMQ seraient l'outil correct à l'échelle. Au volume du MVP —
   * quelques centaines d'envois par jour — ils ajouteraient une dépendance à
   * exploiter, à superviser et à redémarrer pour un gain nul. Le rattrapage des
   * envois en souffrance est assuré par `retryPending`, appelé par le même
   * planificateur que les rappels. Le jour où le volume le justifie, ce point
   * est le seul à remplacer.
   */
  schedule(notificationId: string): void {
    const running = this.deliver(notificationId)
      .catch((error: unknown) => {
        this.logger.error(`Diffusion impossible pour ${notificationId} : ${describe(error)}`);
      })
      .finally(() => {
        this.inFlight.delete(running);
      });

    this.inFlight.add(running);
    waitUntil(running);
  }

  /**
   * Attend les diffusions en cours.
   *
   * `Promise.allSettled` et non `all` : une diffusion en échec a déjà été
   * journalisée, et faire échouer l'arrêt du processus à cause d'un SMS non
   * parti serait disproportionné.
   */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.drain();
  }

  /**
   * Diffuse une notification déjà écrite en base.
   *
   * `only` restreint la diffusion à un canal : c'est ce que fait la reprise
   * d'un envoi en échec. Sans lui, un WhatsApp refusé par l'opérateur
   * renverrait aussi l'e-mail et la notification déjà reçus.
   */
  async deliver(
    notificationId: string,
    options: { only?: NotificationChannel } = {},
  ): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        actionUrl: true,
        actionLabel: true,
        user: {
          select: {
            id: true,
            phone: true,
            email: true,
            notificationPreference: {
              select: { whatsapp: true, sms: true, email: true },
            },
          },
        },
      },
    });

    if (!notification) return;

    const { user } = notification;
    const preference = {
      whatsapp: user.notificationPreference?.whatsapp ?? DEFAULT_NOTIFICATION_PREFERENCES.whatsapp,
      sms: user.notificationPreference?.sms ?? DEFAULT_NOTIFICATION_PREFERENCES.sms,
      email: user.notificationPreference?.email ?? DEFAULT_NOTIFICATION_PREFERENCES.email,
    };
    const wants = (channel: NotificationChannel) =>
      options.only === undefined || options.only === channel;

    // ── 1. L'appareil ─────────────────────────────────────────────────────
    if (wants('PUSH')) {
      await this.push.sendToUser(
        user.id,
        {
          title: notification.title,
          body: notification.body,
          url: notification.actionUrl,
          tag: `${notification.type}:${notification.id}`,
        },
        { notificationId: notification.id, urgent: isMandatory(notification.type) },
      );
    }

    // ── 2. L'e-mail ───────────────────────────────────────────────────────
    if (wants('EMAIL') && user.email && preference.email) {
      await this.sendEmail({
        userId: user.id,
        notificationId: notification.id,
        to: user.email,
        subject: notification.title,
        html: renderNotificationEmail({
          title: notification.title,
          body: notification.body,
          actionLabel: notification.actionLabel,
          actionUrl: `${this.webUrl}${notification.actionUrl}`,
          settingsUrl: `${this.webUrl}/mon-compte/notifications`,
        }),
        text: `${notification.body}\n\n${notification.actionLabel} : ${this.webUrl}${notification.actionUrl}`,
      });
    }

    // ── 3. Le téléphone : WhatsApp, SMS en secours ────────────────────────
    if (!(wants('WHATSAPP') || wants('SMS'))) return;

    const channel = pickPhoneChannel(
      notification.type,
      preference,
      await this.settings.getNotificationSettings(),
    );

    if (!channel) {
      // Le participant n'a pas choisi de canal téléphonique pour ce type, ou
      // la plateforme l'a coupé. La notification reste dans l'application.
      return;
    }

    const log = await this.prisma.messageLog.create({
      data: {
        notificationId: notification.id,
        userId: user.id,
        channel,
        destination: user.phone,
        status: 'QUEUED',
      },
      select: { id: true },
    });

    try {
      await this.sms.sendMessage({
        phone: user.phone,
        channel: channel === 'WHATSAPP' ? 'WHATSAPP' : 'SMS',
        text: `${notification.title}\n${notification.body}`,
      });

      await this.prisma.messageLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date(), attemptCount: { increment: 1 } },
      });
    } catch (error) {
      await this.prisma.messageLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          // La contrainte `message_log_failure_is_explained` refuse un échec
          // sans motif : le support lira cette phrase, pas un code.
          failureReason: describe(error),
          attemptCount: { increment: 1 },
        },
      });

      this.logger.warn(`Envoi ${channel} échoué pour ${user.phone}`);
    }
  }

  /**
   * Envoi direct, sans passer par le centre de notifications.
   *
   * ── Pourquoi cette porte existe ──────────────────────────────────────────
   * Le centre de notifications appartient au PARTICIPANT, et ses types sont
   * fermés à dessein. Certains messages ne lui sont pas destinés : la décision
   * sur un dossier de vérification s'adresse à un organisateur, qui suit son
   * dossier dans son espace professionnel.
   *
   * Les faire passer par le centre obligerait à détourner un type existant —
   * annoncer une vérification sous l'étiquette « paiement confirmé » — ou à en
   * ajouter un, ce que le produit refuse. Ils partent donc directement, et
   * `MessageLog` en garde la trace comme pour les autres.
   *
   * Ne lève jamais, pour la même raison que `schedule` : l'appelant est en
   * train de statuer sur un dossier, et un opérateur injoignable ne doit pas
   * annuler sa décision.
   */
  async sendDirect(input: { userId: string; phone: string; text: string }): Promise<void> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId: input.userId },
      select: { whatsapp: true, sms: true },
    });

    const channel = pickCriticalChannel({
      whatsapp: preference?.whatsapp ?? true,
      sms: preference?.sms ?? true,
    });

    if (!channel) return;

    const log = await this.prisma.messageLog.create({
      data: {
        userId: input.userId,
        channel,
        destination: input.phone,
        status: 'QUEUED',
      },
      select: { id: true },
    });

    try {
      await this.sms.sendMessage({
        phone: input.phone,
        channel: channel === 'WHATSAPP' ? 'WHATSAPP' : 'SMS',
        text: input.text,
      });

      await this.prisma.messageLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date(), attemptCount: { increment: 1 } },
      });
    } catch (error) {
      await this.prisma.messageLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          failureReason: describe(error),
          attemptCount: { increment: 1 },
        },
      });
    }
  }

  /**
   * Envoi d'un e-mail — reçu, alerte, confirmation, ou billet.
   *
   * ── Pourquoi ce n'est pas fusionné avec `sendMessage` (SMS/WhatsApp) ─────
   * Les deux journalisent dans `MessageLog` et ne lèvent jamais, mais
   * s'arrêtent là : un e-mail porte un sujet, du HTML et des pièces jointes —
   * rien de commun avec un texte de 160 caractères vers un opérateur
   * télécom. Les fusionner sous une signature commune obligerait à des champs
   * optionnels qui ne concernent que l'un des deux canaux.
   */
  async sendEmail(input: {
    userId?: string;
    notificationId?: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    attachments?: readonly EmailAttachment[];
    headers?: Readonly<Record<string, string>>;
  }): Promise<boolean> {
    if (!input.to) return false;

    const log = await this.prisma.messageLog.create({
      data: {
        notificationId: input.notificationId,
        userId: input.userId,
        channel: 'EMAIL',
        destination: input.to,
        status: 'QUEUED',
      },
      select: { id: true },
    });

    try {
      await this.email.send(input);

      await this.prisma.messageLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date(), attemptCount: { increment: 1 } },
      });

      return true;
    } catch (error) {
      await this.prisma.messageLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          failureReason: describe(error),
          attemptCount: { increment: 1 },
        },
      });

      this.logger.warn(`Envoi e-mail échoué pour ${input.to}`);
      return false;
    }
  }

  /**
   * Reprend les envois restés en souffrance.
   *
   * Deux cas les produisent : un processus arrêté entre la création de la
   * notification et sa diffusion, et un opérateur momentanément injoignable.
   *
   * Trois tentatives au maximum. Au-delà, le problème n'est pas passager — un
   * numéro invalide, une ligne résiliée — et réessayer indéfiniment coûterait
   * de l'argent sans jamais aboutir.
   *
   * Le push n'est jamais repris : le service de notification garde déjà le
   * message vingt-quatre heures, et ses refus sont définitifs (voir
   * `PushService.sendToUser`).
   */
  async retryPending(limit = 50): Promise<{ retried: number }> {
    const stale = new Date(Date.now() - 5 * 60_000);

    const pending = await this.prisma.messageLog.findMany({
      where: {
        status: { in: ['QUEUED', 'FAILED'] },
        attemptCount: { lt: 3 },
        createdAt: { lt: stale },
        notificationId: { not: null },
        channel: { not: 'PUSH' },
      },
      select: { id: true, notificationId: true, channel: true },
      take: limit,
    });

    // Les journaux repris sont supprimés : `deliver` en crée un neuf, et
    // conserver les deux ferait apparaître deux envois là où il n'y en a qu'un.
    for (const entry of pending) {
      await this.prisma.messageLog.delete({ where: { id: entry.id } });
      await this.deliver(entry.notificationId as string, { only: entry.channel });
    }

    if (pending.length > 0) {
      this.logger.log(`${pending.length} envoi(s) repris`);
    }

    return { retried: pending.length };
  }
}

/**
 * Le canal téléphonique d'une notification.
 *
 * Critique (billet, annulation) : WhatsApp d'abord, SMS en secours — le
 * participant doit l'apprendre même sans ouvrir l'application. Le reste :
 * WhatsApp seulement, s'il l'a choisi ET si la plateforme l'autorise.
 */
function pickPhoneChannel(
  type: NotificationType,
  accepted: { whatsapp: boolean; sms: boolean },
  settings: PlatformNotificationSettings,
): NotificationChannel | null {
  if (isMandatory(type)) return pickCriticalChannel(accepted);

  return accepted.whatsapp && settings.whatsappForNonUrgent ? 'WHATSAPP' : null;
}

/** WhatsApp d'abord, SMS en repli, rien si les deux sont coupés. */
function pickCriticalChannel(accepted: {
  whatsapp: boolean;
  sms: boolean;
}): NotificationChannel | null {
  if (accepted.whatsapp) return 'WHATSAPP';
  if (accepted.sms) return 'SMS';
  return null;
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "L'opérateur n'a pas pu être joint.";
}
