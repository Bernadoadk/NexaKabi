import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NewsletterEvent } from '@nexakabi/contracts';
import type { Env } from '../../config/env';
import { publicApiUrl, publicWebUrl } from '../../config/public-urls';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ADVISORY_LOCKS, AdvisoryLockService } from '../../infra/scheduling/advisory-lock.service';
import { EmailProvider } from '../notifications/email.provider';
import { loadNewsletterEvents } from './newsletter-events';
import { renderCampaignEmail, type CampaignContent } from './newsletter-renderer';

/**
 * Envois par passage.
 *
 * Un SMTP comme celui de Gmail accepte une à deux adresses par seconde : 40
 * envois tiennent dans une trentaine de secondes, sous le plafond d'une
 * fonction serverless. Le passage suivant, une minute plus tard, reprend là
 * où celui-ci s'est arrêté.
 */
const BATCH_SIZE = 40;

/** Temps de travail maximal d'un passage, même s'il reste des envois dans le lot. */
const TIME_BUDGET_MS = 40_000;

/** Tentatives par adresse avant de conclure à l'échec. */
const MAX_ATTEMPTS = 4;

/**
 * Attente avant une nouvelle tentative, multipliée par le nombre d'essais :
 * 10, 20 puis 30 minutes. Un quota journalier ou un serveur saturé ne se
 * débloque pas en une minute, et réessayer aussitôt brûlerait les tentatives.
 */
const RETRY_STEP_MS = 10 * 60 * 1000;

/**
 * Échecs d'affilée qui font suspendre le passage. Trois adresses refusées de
 * suite, c'est le fournisseur qui refuse, pas les adresses : inutile de
 * consommer les tentatives de toutes les autres.
 */
const CONSECUTIVE_FAILURES_STOP = 3;

/**
 * Envoi des campagnes — la file et ses passages.
 *
 * ── Le déroulé ──────────────────────────────────────────────────────────────
 *  1. Au lancement (ou à l'heure programmée), une ligne `NewsletterDelivery`
 *     est créée par abonné ACTIF à cet instant.
 *  2. Chaque passage (tâche `send-newsletter`, chaque minute) en envoie un
 *     lot, dans l'ordre de création.
 *  3. Quand plus rien n'attend, la campagne passe « Envoyée ».
 *
 * Un abonné qui se désabonne pendant l'envoi est sauté (`SKIPPED`) : son
 * départ s'applique immédiatement, pas à la campagne suivante.
 */
@Injectable()
export class NewsletterSenderService {
  private readonly logger = new Logger(NewsletterSenderService.name);
  private readonly webUrl: string;
  private readonly apiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly locks: AdvisoryLockService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = publicWebUrl(config);
    this.apiUrl = publicApiUrl(config);
  }

  /**
   * Passage complet, sous verrou — la SEULE façon d'envoyer.
   *
   * ── Pourquoi le verrou vit ici ─────────────────────────────────────────────
   * Deux chemins déclenchent un passage : la tâche planifiée, chaque minute, et
   * le clic « Envoyer » de la console, qui n'attend pas la minute suivante. Les
   * envois en attente ne sont pas réservés ligne à ligne : deux passages
   * simultanés prendraient le même lot, et chaque abonné recevrait la campagne
   * deux fois. Un seul passage à la fois, où qu'il soit déclenché.
   *
   * @returns le compte rendu, ou `null` si un autre passage était en cours.
   */
  async runExclusively(): Promise<{ started: number; sent: number; failed: number } | null> {
    return this.locks.runExclusively(ADVISORY_LOCKS.sendNewsletter, () => this.tick());
  }

  /** Passage complet : campagnes programmées dues, lot d'envois, campagnes terminées. */
  async tick(now = new Date()): Promise<{ started: number; sent: number; failed: number }> {
    const due = await this.prisma.newsletterCampaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
    });

    for (const campaign of due) {
      await this.start(campaign.id);
    }

    const { sent, failed } = await this.processBatch(now);
    await this.completeFinished();

    return { started: due.length, sent, failed };
  }

  /**
   * Lance une campagne : crée un envoi par abonné actif, et la passe « en cours ».
   *
   * ── D'un seul bloc ─────────────────────────────────────────────────────────
   * L'état « en cours » et la file qui va avec naissent dans la MÊME
   * transaction. Écrits l'un après l'autre, un passage tombé entre les deux
   * voyait une campagne en cours sans rien à envoyer — et la déclarait
   * « envoyée », à vide, avant que sa file n'existe.
   *
   * La mise à jour est conditionnelle : deux lancements simultanés — un clic et
   * le passage programmé, ou deux instances — n'en réussissent qu'un ; le
   * second attend la fin du premier, et ne trouve plus rien à lancer.
   */
  async start(campaignId: string): Promise<{ recipients: number } | null> {
    const now = new Date();

    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.newsletterCampaign.updateMany({
          where: { id: campaignId, status: { in: ['DRAFT', 'SCHEDULED'] } },
          data: { status: 'SENDING', startedAt: now },
        });

        if (claimed.count === 0) return null;

        const subscribers = await tx.newsletterSubscriber.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, email: true },
          orderBy: { confirmedAt: 'asc' },
        });

        // Par tranches : une seule requête de cinquante mille lignes dépasserait
        // la taille de message que PostgreSQL et le pilote acceptent.
        for (let index = 0; index < subscribers.length; index += 1_000) {
          await tx.newsletterDelivery.createMany({
            data: subscribers.slice(index, index + 1_000).map((subscriber) => ({
              campaignId,
              subscriberId: subscriber.id,
              email: subscriber.email,
            })),
            skipDuplicates: true,
          });
        }

        await tx.newsletterCampaign.update({
          where: { id: campaignId },
          data: { recipientCount: subscribers.length },
        });

        return { recipients: subscribers.length };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    if (outcome) {
      this.logger.log(`Campagne ${campaignId} lancée vers ${outcome.recipients} abonné(s)`);
    }

    return outcome;
  }

  /** Envoie un lot d'envois en attente, toutes campagnes en cours confondues. */
  async processBatch(now = new Date()): Promise<{ sent: number; failed: number }> {
    const startedAt = Date.now();

    // Une adresse en échec attend son tour de reprise — plus longtemps à
    // chaque essai ; les autres passent sans l'attendre.
    const retryWindows = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, index) => ({
      attemptCount: index + 1,
      updatedAt: { lte: new Date(now.getTime() - (index + 1) * RETRY_STEP_MS) },
    }));

    const ready = await this.prisma.newsletterDelivery.findMany({
      where: {
        status: 'QUEUED',
        campaign: { status: 'SENDING' },
        OR: [{ attemptCount: 0 }, ...retryWindows],
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        email: true,
        attemptCount: true,
        campaignId: true,
        subscriber: { select: { status: true, token: true } },
      },
    });

    const contents = new Map<string, { content: CampaignContent; events: NewsletterEvent[] }>();
    let sent = 0;
    let failed = 0;
    let consecutiveFailures = 0;

    for (const delivery of ready) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      if (delivery.subscriber.status !== 'ACTIVE') {
        await this.prisma.newsletterDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SKIPPED' },
        });
        continue;
      }

      let campaign = contents.get(delivery.campaignId);
      if (!campaign) {
        campaign = await this.loadCampaign(delivery.campaignId, now);
        contents.set(delivery.campaignId, campaign);
      }

      const unsubscribeUrl = `${this.webUrl}/newsletter/desabonnement?t=${encodeURIComponent(delivery.subscriber.token)}`;
      const oneClickUrl = `${this.apiUrl}/newsletter/unsubscribe?token=${encodeURIComponent(delivery.subscriber.token)}`;
      const message = renderCampaignEmail({
        content: campaign.content,
        events: campaign.events,
        webUrl: this.webUrl,
        unsubscribeUrl,
      });

      try {
        await this.email.send({
          to: delivery.email,
          subject: campaign.content.subject,
          html: message.html,
          text: message.text,
          headers: {
            // Désabonnement en un clic depuis la boîte de réception (RFC 8058),
            // exigé par Gmail et Yahoo pour tout envoi en nombre.
            'List-Unsubscribe': `<${oneClickUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });

        await this.prisma.newsletterDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            attemptCount: { increment: 1 },
            failureReason: null,
          },
        });

        sent += 1;
        consecutiveFailures = 0;
      } catch (error) {
        const attempts = delivery.attemptCount + 1;
        const reason = describe(error);

        await this.prisma.newsletterDelivery.update({
          where: { id: delivery.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'QUEUED',
            attemptCount: attempts,
            failureReason: reason,
          },
        });

        failed += 1;
        consecutiveFailures += 1;
        this.logger.warn(`Newsletter non remise à ${delivery.email} : ${reason}`);

        if (consecutiveFailures >= CONSECUTIVE_FAILURES_STOP) {
          this.logger.warn(
            'Newsletter : trois refus d’affilée, le fournisseur d’e-mail bloque — passage suspendu.',
          );
          break;
        }
      }
    }

    return { sent, failed };
  }

  /** Les campagnes dont plus rien n'attend passent « Envoyée ». */
  private async completeFinished(): Promise<void> {
    const sending = await this.prisma.newsletterCampaign.findMany({
      where: { status: 'SENDING', deliveries: { none: { status: 'QUEUED' } } },
      select: { id: true },
    });

    for (const campaign of sending) {
      await this.prisma.newsletterCampaign.updateMany({
        where: { id: campaign.id, status: 'SENDING' },
        data: { status: 'SENT', completedAt: new Date() },
      });

      this.logger.log(`Campagne ${campaign.id} terminée`);
    }
  }

  private async loadCampaign(
    campaignId: string,
    now: Date,
  ): Promise<{ content: CampaignContent; events: NewsletterEvent[] }> {
    const campaign = await this.prisma.newsletterCampaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: {
        subject: true,
        preheader: true,
        heading: true,
        body: true,
        ctaLabel: true,
        ctaUrl: true,
        eventIds: true,
      },
    });

    return {
      content: campaign,
      events: await loadNewsletterEvents(this.prisma, campaign.eventIds, now),
    };
  }
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.slice(0, 500);
  }

  return 'Le serveur d’e-mail n’a pas pu être joint.';
}
