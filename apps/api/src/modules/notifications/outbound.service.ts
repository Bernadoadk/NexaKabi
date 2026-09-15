import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EmailProvider, type EmailAttachment } from './email.provider';
import { SmsProvider } from './sms.provider';
import type { NotificationChannel } from '@nexakabi/contracts';

/**
 * Diffusion sortante des notifications.
 *
 * ── Ce qui part réellement, et ce qui reste dans l'application ──────────────
 * Tout arrive dans le centre de notifications : c'est gratuit, immédiat, et
 * consultable hors ligne. Seuls certains types partent AUSSI par SMS ou
 * WhatsApp, parce qu'un message sortant coûte de l'argent à chaque envoi et
 * qu'un participant qui en reçoit trop finit par tous les ignorer.
 *
 * La règle retenue : ne sort de l'application que ce qui a une conséquence si
 * on le rate. Un paiement confirmé — c'est le billet. Un événement annulé —
 * c'est un déplacement pour rien. Le reste attend l'ouverture de l'application.
 *
 * ── Pourquoi un seul canal externe par notification ────────────────────────
 * Envoyer le même message par SMS ET WhatsApp double le coût pour ne rien
 * apporter : le participant l'a déjà lu. WhatsApp d'abord quand il est
 * disponible (moins cher, plus riche), SMS en repli — il arrive partout,
 * y compris sur les téléphones à touches encore courants hors de Cotonou.
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsProvider,
    private readonly email: EmailProvider,
  ) {}

  /**
   * Programme la diffusion, sans la retenir.
   *
   * Ne renvoie rien et ne lève jamais : l'appelant est en train de confirmer un
   * paiement ou de publier un événement, et un opérateur injoignable ne doit
   * pas faire échouer ces opérations. Le sort de l'envoi vit dans `MessageLog`.
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

  /** Diffuse une notification déjà écrite en base. */
  async deliver(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
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

    const preference = notification.user.notificationPreference;

    /**
     * L'e-mail est indépendant du reste de cette méthode : `leavesTheApp` et
     * le plafond « un seul canal externe » existent pour contenir le COÛT du
     * SMS/WhatsApp, une contrainte que l'e-mail n'a pas. Il part donc pour
     * tout type de notification, dès que l'abonné l'a choisi et qu'une
     * adresse existe sur son compte — indépendamment de ce qui suit.
     */
    if (notification.user.email && (preference?.email ?? false)) {
      await this.sendEmail({
        userId: notification.user.id,
        notificationId: notification.id,
        to: notification.user.email,
        subject: notification.title,
        html: renderSimpleEmail(notification.title, notification.body),
        text: notification.body,
      });
    }

    if (!leavesTheApp(notification.type)) {
      // Rien de plus à envoyer : la notification est déjà consultable dans
      // l'application, et c'est suffisant pour ce type au-delà de l'e-mail.
      return;
    }

    const channel = pickChannel({
      whatsapp: preference?.whatsapp ?? true,
      sms: preference?.sms ?? true,
    });

    if (!channel) {
      // Le participant a coupé les deux canaux externes. C'est son droit : la
      // notification reste dans l'application.
      return;
    }

    const log = await this.prisma.messageLog.create({
      data: {
        notificationId: notification.id,
        userId: notification.user.id,
        channel,
        destination: notification.user.phone,
        status: 'QUEUED',
      },
      select: { id: true },
    });

    try {
      await this.sms.sendMessage({
        phone: notification.user.phone,
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

      this.logger.warn(`Envoi ${channel} échoué pour ${notification.user.phone}`);
    }
  }

  /**
   * Envoi direct, sans passer par le centre de notifications.
   *
   * ── Pourquoi cette porte existe ──────────────────────────────────────────
   * Le centre de notifications appartient au PARTICIPANT, et ses quatre types
   * sont fermés à dessein. Certains messages ne lui sont pas destinés : la
   * décision sur un dossier de vérification s'adresse à un organisateur, qui
   * suit son dossier dans son espace professionnel.
   *
   * Les faire passer par le centre obligerait à détourner un type existant —
   * annoncer une vérification sous l'étiquette « paiement confirmé » — ou à en
   * ajouter un cinquième, ce que le produit refuse. Ils partent donc
   * directement, et `MessageLog` en garde la trace comme pour les autres.
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

    const channel = pickChannel({
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
   * Envoi d'un e-mail — reçu, alerte, ou appelé directement pour un billet.
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
  }): Promise<void> {
    if (!input.to) return;

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
   */
  async retryPending(limit = 50): Promise<{ retried: number }> {
    const stale = new Date(Date.now() - 5 * 60_000);

    const pending = await this.prisma.messageLog.findMany({
      where: {
        status: { in: ['QUEUED', 'FAILED'] },
        attemptCount: { lt: 3 },
        createdAt: { lt: stale },
        notificationId: { not: null },
      },
      select: { id: true, notificationId: true },
      take: limit,
    });

    // Les journaux repris sont supprimés : `deliver` en crée un neuf, et
    // conserver les deux ferait apparaître deux envois là où il n'y en a qu'un.
    for (const entry of pending) {
      await this.prisma.messageLog.delete({ where: { id: entry.id } });
      await this.deliver(entry.notificationId as string);
    }

    if (pending.length > 0) {
      this.logger.log(`${pending.length} envoi(s) repris`);
    }

    return { retried: pending.length };
  }
}

/**
 * Ce type mérite-t-il de sortir de l'application ?
 *
 * Un rappel J-7 dans le centre suffit. Une annulation, non : le participant
 * doit l'apprendre même s'il n'ouvre pas l'application avant de partir.
 */
function leavesTheApp(type: string): boolean {
  return type === 'PAYMENT_CONFIRMED' || type === 'EVENT_UPDATED';
}

/** WhatsApp d'abord, SMS en repli, rien si les deux sont coupés. */
function pickChannel(accepted: { whatsapp: boolean; sms: boolean }): NotificationChannel | null {
  if (accepted.whatsapp) return 'WHATSAPP';
  if (accepted.sms) return 'SMS';
  return null;
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "L'opérateur n'a pas pu être joint.";
}

/**
 * Habillage minimal d'une notification générique en e-mail.
 *
 * Volontairement sobre — un titre, un corps, la marque en pied de page — pour
 * les alertes qui existaient déjà en texte court (rappel, événement mis à
 * jour…). Un e-mail qui porte quelque chose de plus riche, comme le billet,
 * compose son propre gabarit ailleurs plutôt que de détourner celui-ci.
 */
function renderSimpleEmail(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:32px 16px;background:#F5F4F8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#12102B;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;">
      <tr><td style="background:#12102B;padding:20px 28px;">
        <span style="color:#FFFFFF;font-weight:800;font-size:16px;">Nexa-Kabi</span>
      </td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 12px;font-size:20px;">${escapeHtml(title)}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#3A3752;">${escapeHtml(body)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Échappe les caractères sensibles au HTML — un titre ou un corps ne sont jamais du balisage de confiance. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
