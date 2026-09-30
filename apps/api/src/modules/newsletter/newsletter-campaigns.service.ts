import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateNewsletterCampaignInput,
  NewsletterCampaignDetail,
  NewsletterCampaignStatus,
  NewsletterCampaignSummary,
  NewsletterEvent,
  NewsletterOverview,
  NewsletterPreview,
  SendNewsletterCampaignInput,
  UpdateNewsletterCampaignInput,
} from '@nexakabi/contracts';
import type { Env } from '../../config/env';
import { publicWebUrl } from '../../config/public-urls';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { runInBackground } from '../../infra/scheduling/background';
import { AuditService } from '../audit/audit.service';
import { OutboundService } from '../notifications/outbound.service';
import { PlatformSettingsService } from '../notifications/platform-settings.service';
import { loadNewsletterEvents, searchNewsletterEvents } from './newsletter-events';
import { renderCampaignEmail } from './newsletter-renderer';
import { NewsletterSenderService } from './newsletter-sender.service';

/** Campagnes affichées sur l'écran d'ensemble. */
const OVERVIEW_CAMPAIGNS = 30;

/** Marge minimale d'une programmation : en deçà, c'est un envoi immédiat. */
const MIN_SCHEDULE_LEAD_MS = 2 * 60 * 1000;

/** Programmation maximale : au-delà, le contenu aura vieilli avant de partir. */
const MAX_SCHEDULE_LEAD_MS = 90 * 24 * 60 * 60 * 1000;

const CAMPAIGN_INCLUDE = {
  createdBy: { select: { fullName: true } },
} satisfies Prisma.NewsletterCampaignInclude;

type CampaignRow = Prisma.NewsletterCampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;

type DeliveryCounts = Record<'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED', number>;

/**
 * Campagnes de la newsletter, côté console.
 *
 * ── Ce qu'une campagne peut faire, et quand ─────────────────────────────────
 *  · BROUILLON : tout se modifie, tout se supprime, les tests partent.
 *  · PROGRAMMÉE : se modifie encore, s'annule ; part seule à l'heure dite.
 *  · EN COURS : ne se modifie plus — une partie des abonnés l'a déjà reçue —
 *    mais s'ARRÊTE : ce qui n'est pas parti ne partira pas.
 *  · ENVOYÉE / ARRÊTÉE : figée. Les envois en échec peuvent être relancés.
 *
 * Chaque lancement, programmation, arrêt et relance est tracé au journal
 * d'audit, avec le nombre d'adresses visées.
 */
@Injectable()
export class NewsletterCampaignsService {
  private readonly logger = new Logger(NewsletterCampaignsService.name);
  private readonly webUrl: string;
  private readonly emailProvider: 'console' | 'smtp';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: NewsletterSenderService,
    private readonly outbound: OutboundService,
    private readonly settings: PlatformSettingsService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = publicWebUrl(config);
    this.emailProvider = config.get('EMAIL_PROVIDER', { infer: true });
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  async overview(now = new Date()): Promise<NewsletterOverview> {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      statuses,
      campaigns,
      settings,
      recommendationSubscribers,
      recommendationsLast7Days,
      followers,
    ] = await Promise.all([
      this.prisma.newsletterSubscriber.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.newsletterCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: OVERVIEW_CAMPAIGNS,
        include: CAMPAIGN_INCLUDE,
      }),
      this.settings.getNotificationSettings(),
      this.prisma.notificationPreference.count({ where: { recommendations: true } }),
      this.prisma.notification.count({
        where: { type: 'RECOMMENDATION', createdAt: { gte: weekAgo } },
      }),
      this.prisma.user.count({ where: { follows: { some: {} } } }),
    ]);

    const counts = await this.deliveryCounts(campaigns.map((campaign) => campaign.id));
    const byStatus = new Map(statuses.map((row) => [row.status, row._count._all]));

    return {
      subscribers: {
        active: byStatus.get('ACTIVE') ?? 0,
        pending: byStatus.get('PENDING') ?? 0,
        unsubscribed: byStatus.get('UNSUBSCRIBED') ?? 0,
      },
      campaigns: campaigns.map((campaign) => toSummary(campaign, counts.get(campaign.id))),
      settings,
      recommendationSubscribers,
      recommendationsLast7Days,
      followers,
      emailProvider: this.emailProvider,
    };
  }

  async get(campaignId: string): Promise<NewsletterCampaignDetail> {
    const campaign = await this.find(campaignId);

    const [counts, events, recentFailures] = await Promise.all([
      this.deliveryCounts([campaign.id]),
      loadNewsletterEvents(this.prisma, campaign.eventIds),
      this.prisma.newsletterDelivery.findMany({
        where: { campaignId: campaign.id, failureReason: { not: null }, status: { not: 'SENT' } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { email: true, failureReason: true },
      }),
    ]);

    return {
      ...toSummary(campaign, counts.get(campaign.id)),
      preheader: campaign.preheader,
      heading: campaign.heading,
      body: campaign.body,
      ctaLabel: campaign.ctaLabel,
      ctaUrl: campaign.ctaUrl,
      events,
      recentFailures: recentFailures.map((failure) => ({
        email: failure.email,
        reason: failure.failureReason ?? '',
      })),
    };
  }

  /** L'e-mail tel qu'il partira, et à combien d'adresses. */
  async preview(campaignId: string): Promise<NewsletterPreview> {
    const campaign = await this.find(campaignId);
    const [events, audience] = await Promise.all([
      loadNewsletterEvents(this.prisma, campaign.eventIds),
      this.prisma.newsletterSubscriber.count({ where: { status: 'ACTIVE' } }),
    ]);

    const message = renderCampaignEmail({
      content: campaign,
      events,
      webUrl: this.webUrl,
      // Lien factice : l'aperçu n'est l'e-mail de personne.
      unsubscribeUrl: `${this.webUrl}/newsletter/desabonnement`,
    });

    return { subject: campaign.subject, html: message.html, text: message.text, audience };
  }

  /** Événements proposés par le sélecteur : publiés, publics, à venir. */
  searchEvents(search: string | undefined): Promise<NewsletterEvent[]> {
    return searchNewsletterEvents(this.prisma, search);
  }

  // ── Rédaction ─────────────────────────────────────────────────────────────

  async create(
    input: CreateNewsletterCampaignInput,
    adminId: string,
  ): Promise<NewsletterCampaignDetail> {
    await this.assertEventsExist(input.eventIds ?? []);

    const campaign = await this.prisma.newsletterCampaign.create({
      data: {
        subject: input.subject,
        preheader: blankToNull(input.preheader),
        heading: blankToNull(input.heading),
        body: input.body ?? '',
        ctaLabel: blankToNull(input.ctaLabel),
        ctaUrl: blankToNull(input.ctaUrl),
        eventIds: input.eventIds ?? [],
        createdById: adminId,
      },
      select: { id: true },
    });

    return this.get(campaign.id);
  }

  async update(
    campaignId: string,
    input: UpdateNewsletterCampaignInput,
  ): Promise<NewsletterCampaignDetail> {
    const campaign = await this.find(campaignId);
    assertEditable(campaign.status);

    if (input.eventIds) await this.assertEventsExist(input.eventIds);

    // Le bouton se juge sur l'état FINAL : un libellé envoyé seul complète
    // un lien déjà enregistré, il ne le remplace pas.
    const ctaLabel = input.ctaLabel === undefined ? campaign.ctaLabel : blankToNull(input.ctaLabel);
    const ctaUrl = input.ctaUrl === undefined ? campaign.ctaUrl : blankToNull(input.ctaUrl);

    if ((ctaLabel === null) !== (ctaUrl === null)) {
      throw new BadRequestException('Le bouton demande un libellé ET un lien.');
    }

    await this.prisma.newsletterCampaign.update({
      where: { id: campaignId },
      data: {
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.preheader !== undefined ? { preheader: blankToNull(input.preheader) } : {}),
        ...(input.heading !== undefined ? { heading: blankToNull(input.heading) } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.eventIds !== undefined ? { eventIds: input.eventIds } : {}),
        ctaLabel,
        ctaUrl,
      },
    });

    return this.get(campaignId);
  }

  /**
   * Nouvelle campagne à partir d'une autre — pour reprendre une lettre partie,
   * la corriger, ou la renvoyer le mois suivant.
   */
  async duplicate(campaignId: string, adminId: string): Promise<NewsletterCampaignDetail> {
    const source = await this.find(campaignId);

    const copy = await this.prisma.newsletterCampaign.create({
      data: {
        subject: `${source.subject} (copie)`.slice(0, 150),
        preheader: source.preheader,
        heading: source.heading,
        body: source.body,
        ctaLabel: source.ctaLabel,
        ctaUrl: source.ctaUrl,
        eventIds: source.eventIds,
        createdById: adminId,
      },
      select: { id: true },
    });

    return this.get(copy.id);
  }

  /** Seul un brouillon se supprime : une campagne partie est une trace. */
  async remove(campaignId: string): Promise<void> {
    const campaign = await this.find(campaignId);

    if (campaign.status !== 'DRAFT') {
      throw new ConflictException(
        'Seul un brouillon se supprime. Une campagne programmée s’annule ; une campagne partie reste au journal.',
      );
    }

    await this.prisma.newsletterCampaign.delete({ where: { id: campaignId } });
  }

  // ── Envoi ─────────────────────────────────────────────────────────────────

  /**
   * Envoi de test : l'e-mail exact, à une seule adresse, marqué « [Test] ».
   *
   * Le lien de désabonnement n'y mène nulle part d'utile — l'adresse de test
   * n'est pas forcément abonnée, et elle ne doit surtout pas le devenir.
   */
  async sendTest(campaignId: string, email: string, adminId: string): Promise<{ sent: boolean }> {
    const campaign = await this.find(campaignId);
    const events = await loadNewsletterEvents(this.prisma, campaign.eventIds);

    const message = renderCampaignEmail({
      content: campaign,
      events,
      webUrl: this.webUrl,
      unsubscribeUrl: `${this.webUrl}/newsletter/desabonnement`,
    });

    const sent = await this.outbound.sendEmail({
      to: email,
      subject: `[Test] ${campaign.subject}`,
      html: message.html,
      text: message.text,
    });

    this.logger.log(`Test de la campagne ${campaignId} envoyé par ${adminId}`);

    if (!sent) {
      throw new BadRequestException(
        'Le serveur d’e-mail a refusé l’envoi de test. Vérifie l’adresse et la configuration SMTP.',
      );
    }

    return { sent };
  }

  /**
   * Lance la campagne maintenant, ou la programme.
   *
   * Refusée sans contenu, ou sans abonné actif — une campagne envoyée à
   * personne ne serait qu'une ligne trompeuse dans l'historique.
   */
  async send(
    campaignId: string,
    input: SendNewsletterCampaignInput,
    adminId: string,
  ): Promise<NewsletterCampaignDetail> {
    const campaign = await this.find(campaignId);

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      throw new ConflictException('Cette campagne est déjà partie.');
    }

    if (!campaign.body.trim() && campaign.eventIds.length === 0 && !campaign.heading) {
      throw new BadRequestException(
        'La campagne est vide : écris un texte ou ajoute au moins un événement.',
      );
    }

    const audience = await this.prisma.newsletterSubscriber.count({ where: { status: 'ACTIVE' } });

    if (audience === 0) {
      throw new BadRequestException(
        'Aucun abonné n’a encore confirmé son adresse : il n’y a personne à qui envoyer.',
      );
    }

    if (input.scheduledAt) {
      const lead = input.scheduledAt.getTime() - Date.now();

      if (lead < MIN_SCHEDULE_LEAD_MS) {
        throw new BadRequestException(
          'Choisis une date dans au moins deux minutes, ou envoie tout de suite.',
        );
      }

      if (lead > MAX_SCHEDULE_LEAD_MS) {
        throw new BadRequestException('Une campagne se programme à 90 jours au plus.');
      }

      await this.prisma.newsletterCampaign.update({
        where: { id: campaignId },
        data: { status: 'SCHEDULED', scheduledAt: input.scheduledAt },
      });

      await this.audit.record({
        action: 'admin.newsletter.campaign_scheduled',
        actorType: 'ADMIN',
        actorUserId: adminId,
        entityType: 'NewsletterCampaign',
        entityId: campaignId,
        changes: { scheduledAt: input.scheduledAt.toISOString(), audience },
      });

      return this.get(campaignId);
    }

    const started = await this.sender.start(campaignId);

    if (!started) {
      throw new ConflictException('Cette campagne vient d’être lancée par ailleurs.');
    }

    await this.audit.record({
      action: 'admin.newsletter.campaign_sent',
      actorType: 'ADMIN',
      actorUserId: adminId,
      entityType: 'NewsletterCampaign',
      entityId: campaignId,
      changes: { recipients: started.recipients },
    });

    // Le premier lot part tout de suite, sans attendre le passage suivant de
    // la tâche planifiée : la personne qui clique voit l'envoi commencer. Sous
    // verrou, comme la tâche : les deux ne prennent jamais le même lot.
    runInBackground(`Newsletter ${campaignId}`, () => this.sender.runExclusively());

    return this.get(campaignId);
  }

  /**
   * Annule une programmation, ou arrête un envoi en cours.
   *
   * Une campagne programmée n'est encore partie vers personne : elle redevient
   * un brouillon, qu'on corrige et qu'on reprogramme. Une campagne en cours,
   * elle, s'ARRÊTE : ce qui est parti est parti, ce qui attendait est marqué
   * « sauté », et elle ne repartira plus.
   */
  async cancel(campaignId: string, adminId: string): Promise<NewsletterCampaignDetail> {
    const campaign = await this.find(campaignId);

    if (campaign.status === 'SCHEDULED') {
      // Conditionnelle : si le passage d'envoi vient de la lancer, elle n'est
      // plus programmée, et c'est un arrêt qu'il faut demander.
      const reverted = await this.prisma.newsletterCampaign.updateMany({
        where: { id: campaignId, status: 'SCHEDULED' },
        data: { status: 'DRAFT', scheduledAt: null },
      });

      if (reverted.count === 0) {
        throw new ConflictException(
          'L’envoi vient de commencer : actualise la page pour l’arrêter.',
        );
      }

      await this.audit.record({
        action: 'admin.newsletter.campaign_cancelled',
        actorType: 'ADMIN',
        actorUserId: adminId,
        entityType: 'NewsletterCampaign',
        entityId: campaignId,
        changes: {
          from: 'SCHEDULED',
          to: 'DRAFT',
          scheduledAt: campaign.scheduledAt?.toISOString(),
        },
      });

      return this.get(campaignId);
    }

    if (campaign.status !== 'SENDING') {
      throw new ConflictException('Seule une campagne programmée ou en cours s’arrête.');
    }

    const skipped = await this.prisma.$transaction(async (tx) => {
      await tx.newsletterCampaign.update({
        where: { id: campaignId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      const result = await tx.newsletterDelivery.updateMany({
        where: { campaignId, status: 'QUEUED' },
        data: { status: 'SKIPPED' },
      });

      return result.count;
    });

    await this.audit.record({
      action: 'admin.newsletter.campaign_cancelled',
      actorType: 'ADMIN',
      actorUserId: adminId,
      entityType: 'NewsletterCampaign',
      entityId: campaignId,
      changes: { from: 'SENDING', to: 'CANCELLED', skipped },
    });

    return this.get(campaignId);
  }

  /**
   * Relance les envois en échec — après une panne du fournisseur, ou un quota
   * journalier atteint. Chaque adresse repart avec ses tentatives remises à zéro.
   */
  async retryFailed(campaignId: string, adminId: string): Promise<NewsletterCampaignDetail> {
    const campaign = await this.find(campaignId);

    if (campaign.status !== 'SENT' && campaign.status !== 'SENDING') {
      throw new ConflictException('Seule une campagne partie peut relancer ses envois en échec.');
    }

    const retried = await this.prisma.$transaction(async (tx) => {
      const result = await tx.newsletterDelivery.updateMany({
        where: { campaignId, status: 'FAILED' },
        data: { status: 'QUEUED', attemptCount: 0 },
      });

      if (result.count > 0) {
        await tx.newsletterCampaign.update({
          where: { id: campaignId },
          data: { status: 'SENDING', completedAt: null },
        });
      }

      return result.count;
    });

    if (retried === 0) {
      throw new BadRequestException('Aucun envoi en échec à relancer.');
    }

    await this.audit.record({
      action: 'admin.newsletter.campaign_retried',
      actorType: 'ADMIN',
      actorUserId: adminId,
      entityType: 'NewsletterCampaign',
      entityId: campaignId,
      changes: { retried },
    });

    runInBackground(`Newsletter ${campaignId}`, () => this.sender.runExclusively());

    return this.get(campaignId);
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  private async find(campaignId: string): Promise<CampaignRow> {
    const campaign = await this.prisma.newsletterCampaign.findUnique({
      where: { id: campaignId },
      include: CAMPAIGN_INCLUDE,
    });

    if (!campaign) throw new NotFoundException('Cette campagne n’existe pas.');

    return campaign;
  }

  private async assertEventsExist(eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) return;

    const found = await this.prisma.event.count({
      where: { id: { in: [...new Set(eventIds)] }, deletedAt: null },
    });

    if (found !== new Set(eventIds).size) {
      throw new BadRequestException('Un des événements choisis n’existe plus.');
    }
  }

  private async deliveryCounts(
    campaignIds: readonly string[],
  ): Promise<Map<string, DeliveryCounts>> {
    if (campaignIds.length === 0) return new Map();

    const rows = await this.prisma.newsletterDelivery.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: [...campaignIds] } },
      _count: { _all: true },
    });

    const counts = new Map<string, DeliveryCounts>();

    for (const row of rows) {
      const entry = counts.get(row.campaignId) ?? { QUEUED: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
      entry[row.status] = row._count._all;
      counts.set(row.campaignId, entry);
    }

    return counts;
  }
}

function toSummary(campaign: CampaignRow, counts?: DeliveryCounts): NewsletterCampaignSummary {
  return {
    id: campaign.id,
    subject: campaign.subject,
    status: campaign.status,
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    startedAt: campaign.startedAt?.toISOString() ?? null,
    completedAt: campaign.completedAt?.toISOString() ?? null,
    cancelledAt: campaign.cancelledAt?.toISOString() ?? null,
    recipientCount: campaign.recipientCount,
    queuedCount: counts?.QUEUED ?? 0,
    sentCount: counts?.SENT ?? 0,
    failedCount: counts?.FAILED ?? 0,
    skippedCount: counts?.SKIPPED ?? 0,
    createdByName: campaign.createdBy.fullName,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function assertEditable(status: NewsletterCampaignStatus): void {
  if (status !== 'DRAFT' && status !== 'SCHEDULED') {
    throw new ConflictException(
      'Cette campagne est partie : son contenu ne se modifie plus. Duplique-la pour en écrire une nouvelle.',
    );
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
