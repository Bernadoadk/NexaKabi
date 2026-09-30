import { Injectable, Logger } from '@nestjs/common';
import {
  RECOMMENDATION_INTERVAL_DAYS,
  RECOMMENDATION_MAX_EVENTS,
  buildRecommendationMessage,
  type EventSummary,
  type UserInterests,
} from '@nexakabi/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { eventWithRelations, toEventSummary } from '../events/events.mapper';
import { beninHour } from './benin-time';
import { InterestsService } from './interests.service';
import { NotificationsService } from './notifications.service';
import { PlatformSettingsService } from './platform-settings.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Heures locales d'envoi, à Porto-Novo.
 *
 * Une sélection n'a rien d'urgent : elle ne réveille personne. Le balayage
 * tourne toutes les heures, mais ne compose rien hors de cette plage.
 */
const SENDING_HOURS = { from: 9, to: 20 } as const;

/**
 * Délai avant de réexaminer un participant à qui rien n'a été trouvé. Assez
 * court pour qu'un événement publié le lendemain lui parvienne, assez long
 * pour ne pas repasser sur lui à chaque heure.
 */
const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;

/** Participants examinés par passage : de quoi tenir dans la durée d'une fonction. */
const BATCH_SIZE = 200;

/** Événements de la page « Pour toi ». */
const PAGE_SIZE = 24;

/**
 * Sélection selon les goûts — la page « Pour toi » et son envoi hebdomadaire.
 *
 * ── La promesse, et comment elle est tenue ─────────────────────────────────
 * La case de l'inscription dit « un message par semaine au maximum ». Le
 * compte se fait par participant, depuis SA dernière sélection
 * (`lastRecommendationAt`) : pas de grand envoi du lundi qui partirait à tout
 * le monde à la même minute, et quelqu'un qui s'inscrit un jeudi reçoit la
 * sienne dès qu'il y a de quoi la remplir.
 *
 * ── Ce qu'une sélection contient ────────────────────────────────────────────
 * Les événements PUBLIÉS depuis la sélection précédente, à venir, publics,
 * dans ses catégories et ses villes (un événement en ligne convient partout),
 * et qu'il n'a pas déjà achetés. Rien de nouveau : rien n'est envoyé — une
 * sélection vide, ou qui répète la précédente, apprendrait à ignorer toutes
 * les suivantes.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly interests: InterestsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** Passage périodique : compose et envoie les sélections dues. */
  async sweep(now = new Date()): Promise<{ examined: number; sent: number }> {
    const settings = await this.settings.getNotificationSettings();
    if (!settings.recommendationsEnabled) return { examined: 0, sent: 0 };

    const hour = beninHour(now);
    if (hour < SENDING_HOURS.from || hour >= SENDING_HOURS.to) return { examined: 0, sent: 0 };

    const lastSentBefore = new Date(now.getTime() - RECOMMENDATION_INTERVAL_DAYS * DAY_MS);
    const lastCheckedBefore = new Date(now.getTime() - RECHECK_AFTER_MS);

    const due = await this.prisma.notificationPreference.findMany({
      where: {
        recommendations: true,
        AND: [
          {
            OR: [{ lastRecommendationAt: null }, { lastRecommendationAt: { lte: lastSentBefore } }],
          },
          {
            OR: [
              { recommendationCheckedAt: null },
              { recommendationCheckedAt: { lte: lastCheckedBefore } },
            ],
          },
        ],
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: { userId: true, lastRecommendationAt: true },
      orderBy: { recommendationCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: BATCH_SIZE,
    });

    let sent = 0;

    for (const preference of due) {
      try {
        if (await this.composeFor(preference, now, lastSentBefore)) sent += 1;
      } catch (error) {
        // Un participant en échec ne doit pas priver les suivants de leur
        // sélection. Il sera réexaminé au prochain passage.
        this.logger.error({ err: error }, `Sélection impossible pour ${preference.userId}`);
      }
    }

    if (sent > 0) {
      this.logger.log(
        `Sélections : ${sent} envoyée(s) sur ${due.length} participant(s) examiné(s)`,
      );
    }

    return { examined: due.length, sent };
  }

  /** La sélection d'un participant. Vrai si elle est partie. */
  private async composeFor(
    preference: { userId: string; lastRecommendationAt: Date | null },
    now: Date,
    defaultSince: Date,
  ): Promise<boolean> {
    const { userId } = preference;
    const interests = await this.interests.get(userId);

    // Première sélection : la semaine écoulée. Ensuite : depuis la précédente.
    const since = preference.lastRecommendationAt ?? defaultSince;
    const where = matchingEvents(userId, interests, now, since);

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        take: RECOMMENDATION_MAX_EVENTS,
        select: { id: true, title: true },
      }),
      this.prisma.event.count({ where }),
    ]);

    if (events.length === 0) {
      await this.prisma.notificationPreference.update({
        where: { userId },
        data: { recommendationCheckedAt: now },
      });
      return false;
    }

    const message = buildRecommendationMessage(
      events.map((event) => event.title),
      total,
    );

    const result = await this.notifications.notify({
      userId,
      type: 'RECOMMENDATION',
      title: message.title,
      body: message.body,
      actionUrl: '/mon-compte/pour-toi',
      actionLabel: 'Voir la sélection',
      // Une sélection par participant et par jour, quoi qu'il arrive : deux
      // instances qui passeraient en même temps n'en produisent qu'une.
      dedupeKey: `reco:${now.toISOString().slice(0, 10)}`,
    });

    await this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        recommendationCheckedAt: now,
        ...(result.created ? { lastRecommendationAt: now } : {}),
      },
    });

    return result.created;
  }

  /**
   * La page « Pour toi » : tout ce qui correspond, pas seulement les nouveautés.
   *
   * Sans goûts renseignés, tout convient — la page le dit et propose de les
   * choisir, plutôt que d'afficher une liste vide.
   */
  async listForUser(
    userId: string,
    now = new Date(),
  ): Promise<{ events: EventSummary[]; hasInterests: boolean }> {
    const interests = await this.interests.get(userId);

    const rows = await this.prisma.event.findMany({
      ...eventWithRelations,
      where: matchingEvents(userId, interests, now),
      orderBy: { startsAt: 'asc' },
      take: PAGE_SIZE,
    });

    return {
      events: rows.map((row) => toEventSummary(row, now)),
      hasInterests: interests.categoryIds.length > 0 || interests.cityIds.length > 0,
    };
  }
}

/**
 * Les événements qui correspondent aux goûts d'un participant.
 *
 * `since` : seulement ceux publiés depuis — la sélection hebdomadaire. Absent :
 * tous ceux à venir — la page « Pour toi ».
 */
function matchingEvents(
  userId: string,
  interests: UserInterests,
  now: Date,
  since?: Date,
): Prisma.EventWhereInput {
  const clauses: Prisma.EventWhereInput[] = [];

  if (interests.categoryIds.length > 0) {
    clauses.push({
      OR: [
        { categoryId: { in: interests.categoryIds } },
        { subcategoryId: { in: interests.categoryIds } },
      ],
    });
  }

  if (interests.cityIds.length > 0) {
    // Un événement en ligne se suit de partout : il convient à toutes les villes.
    clauses.push({ OR: [{ cityId: { in: interests.cityIds } }, { format: 'ONLINE' }] });
  }

  return {
    deletedAt: null,
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    startsAt: { gt: now },
    ...(since ? { publishedAt: { gt: since } } : {}),
    organization: { status: 'ACTIVE', deletedAt: null },
    // Déjà acheté : il n'a pas besoin qu'on le lui propose.
    orders: { none: { userId, status: { in: ['PAID', 'COMPLETED'] } } },
    AND: clauses,
  };
}
