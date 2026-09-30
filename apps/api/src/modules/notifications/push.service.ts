import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushStatus, PushSubscriptionInput } from '@nexakabi/contracts';
import { sendNotification, WebPushError } from 'web-push';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { describeDevice } from '../auth/device-label';

/** Ce que le service worker affiche. Voir `apps/web/public/sw.js`. */
export interface PushPayload {
  readonly title: string;
  readonly body: string;
  /** Chemin interne ouvert au toucher de la notification. */
  readonly url: string;
  /** Deux notifications de même étiquette se remplacent au lieu de s'empiler. */
  readonly tag?: string;
}

/** Échecs consécutifs tolérés avant de considérer l'appareil comme perdu. */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Durée de conservation par le service de notification d'un message qui n'a
 * pas pu être remis — téléphone éteint, hors réseau. Au-delà d'une journée,
 * un rappel ou une publication a perdu son intérêt : mieux vaut le perdre que
 * le remettre à contretemps.
 */
const TIME_TO_LIVE_SECONDS = 24 * 60 * 60;

/**
 * Notifications sur l'appareil — le standard Web Push.
 *
 * ── Pourquoi ce canal ───────────────────────────────────────────────────────
 * C'est le seul qui réveille un téléphone application fermée sans rien coûter :
 * ni SMS facturé, ni modèle WhatsApp à faire valider. Le navigateur s'abonne
 * auprès de son propre service (Google pour Chrome, Mozilla, Apple, Microsoft),
 * nous confie une adresse et deux clés, et le contenu voyage chiffré de bout en
 * bout : le service de notification ne lit pas ce qu'il transporte.
 *
 * ── Sans clés, rien ─────────────────────────────────────────────────────────
 * Sans paire VAPID (`WEB_PUSH_*`), le service est présent mais muet : aucun
 * abonnement n'est accepté, aucun envoi n'est tenté, et l'écran de réglages
 * l'annonce. Le reste des notifications n'en dépend pas.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  private readonly vapid: { subject: string; publicKey: string; privateKey: string } | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const publicKey = config.get('WEB_PUSH_PUBLIC_KEY', { infer: true });
    const privateKey = config.get('WEB_PUSH_PRIVATE_KEY', { infer: true });
    const subject = config.get('WEB_PUSH_SUBJECT', { infer: true });

    // La validation de l'environnement garantit que les trois vont ensemble.
    this.vapid = publicKey && privateKey && subject ? { subject, publicKey, privateKey } : null;
  }

  /** Clé publique à donner au navigateur, ou `null` si le push n'est pas configuré. */
  get publicKey(): string | null {
    return this.vapid?.publicKey ?? null;
  }

  async status(userId: string): Promise<PushStatus> {
    const devices = this.vapid
      ? await this.prisma.pushSubscription.count({ where: { userId } })
      : 0;

    return { publicKey: this.publicKey, devices };
  }

  /**
   * Enregistre l'appareil courant.
   *
   * Par l'adresse, qui identifie un navigateur sur un appareil : un même
   * téléphone passé d'un compte à l'autre suit la personne connectée, il ne
   * reçoit pas les notifications des deux.
   */
  async subscribe(
    userId: string,
    input: PushSubscriptionInput,
    userAgent?: string,
  ): Promise<PushStatus> {
    if (!this.vapid) {
      throw new BadRequestException(
        'Les notifications sur l’appareil ne sont pas encore disponibles. Les alertes restent dans l’application.',
      );
    }

    const label = describeDevice(userAgent) ?? null;

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        label,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        label,
        failureCount: 0,
      },
    });

    return this.status(userId);
  }

  /** Retire l'appareil courant. Seulement le sien : l'adresse ne suffit pas. */
  async unsubscribe(userId: string, endpoint: string): Promise<PushStatus> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return this.status(userId);
  }

  /**
   * Envoie à tous les appareils d'un participant.
   *
   * Ne lève jamais : un appareil injoignable ne doit pas empêcher les autres
   * canaux de partir. Chaque tentative laisse une ligne dans `MessageLog`.
   *
   * Pas de reprise automatique : le service de notification garde lui-même le
   * message jusqu'à vingt-quatre heures si le téléphone est éteint. Un refus de
   * sa part est, lui, presque toujours définitif — autorisation retirée,
   * application désinstallée — et réessayer n'y changerait rien.
   */
  async sendToUser(
    userId: string,
    payload: PushPayload,
    context: { notificationId?: string; urgent?: boolean } = {},
  ): Promise<{ sent: number }> {
    if (!this.vapid) return { sent: 0 };

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        label: true,
        failureCount: true,
      },
    });

    let sent = 0;

    for (const subscription of subscriptions) {
      const log = await this.prisma.messageLog.create({
        data: {
          notificationId: context.notificationId,
          userId,
          channel: 'PUSH',
          destination: subscription.label ?? new URL(subscription.endpoint).hostname,
          status: 'QUEUED',
        },
        select: { id: true },
      });

      try {
        await sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          {
            vapidDetails: this.vapid,
            TTL: TIME_TO_LIVE_SECONDS,
            // `high` réveille un téléphone en économie d'énergie ; on le
            // réserve à ce qui porte un billet ou une annulation.
            urgency: context.urgent ? 'high' : 'normal',
            timeout: 10_000,
          },
        );

        const now = new Date();
        await this.prisma.$transaction([
          this.prisma.messageLog.update({
            where: { id: log.id },
            data: { status: 'SENT', sentAt: now, attemptCount: 1 },
          }),
          this.prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { lastSuccessAt: now, failureCount: 0 },
          }),
        ]);

        sent += 1;
      } catch (error) {
        const gone =
          error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410);

        await this.prisma.messageLog.update({
          where: { id: log.id },
          data: {
            status: 'FAILED',
            attemptCount: 1,
            failureReason: gone
              ? 'L’appareil n’accepte plus les notifications : autorisation retirée ou application désinstallée.'
              : describe(error),
          },
        });

        if (gone || subscription.failureCount + 1 >= MAX_CONSECUTIVE_FAILURES) {
          // `deleteMany` : un autre envoi a pu le retirer entre-temps.
          await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        } else {
          await this.prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { failureCount: { increment: 1 } },
          });
        }

        this.logger.warn(
          `Push non remis (${subscription.label ?? 'appareil'}) : ${describe(error)}`,
        );
      }
    }

    return { sent };
  }
}

function describe(error: unknown): string {
  if (error instanceof WebPushError) {
    return `Le service de notification a répondu ${error.statusCode}${error.body ? ` : ${error.body.slice(0, 200)}` : ''}.`;
  }

  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return 'Le service de notification n’a pas pu être joint.';
}
