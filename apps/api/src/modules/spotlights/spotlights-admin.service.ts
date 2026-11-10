import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateSpotlightInput,
  type NewsletterEvent,
  type SpotlightAdmin,
  type SpotlightAdminOverview,
  type SpotlightExternalInput,
  type SpotlightVideo,
  type UpdateSpotlightInput,
  type WithdrawSpotlightInput,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { CountriesService } from '../countries/countries.service';
import { searchNewsletterEvents } from '../newsletter/newsletter-events';
import { SpotlightBookingsService } from './spotlight-bookings.service';
import { SpotlightSettingsService } from './spotlight-settings.service';
import { EMPTY_SPOTLIGHT_STATS, SpotlightStatsService } from './spotlight-stats.service';
import { spotlightWithRelations, toSpotlightAdmin, type SpotlightRow } from './spotlights.mapper';

/** Mises en avant terminées ou retirées montrées dans la console, les plus récentes d'abord. */
const PAST_LIMIT = 50;

/**
 * La une, côté console : composer, ordonner, retirer, mesurer — et décider des
 * places achetées (voir `SpotlightBookingsService`).
 *
 * Chaque geste est inscrit au journal d'audit : ce qui s'affiche en vitrine, et
 * ce qui s'y vend, doit pouvoir s'expliquer.
 */
@Injectable()
export class SpotlightsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SpotlightSettingsService,
    private readonly countries: CountriesService,
    private readonly stats: SpotlightStatsService,
    private readonly bookings: SpotlightBookingsService,
    private readonly audit: AuditService,
  ) {}

  async overview(): Promise<SpotlightAdminOverview> {
    // Les places d'abord : leur clôture peut retirer des mises en avant.
    const bookings = await this.bookings.adminOverview();
    const now = new Date();

    const [settings, countries, current, past] = await Promise.all([
      this.settings.get(),
      this.countries.listActive(),
      // En ligne et programmées : toutes, dans l'ordre de la une.
      this.prisma.spotlight.findMany({
        ...spotlightWithRelations,
        where: { status: 'ACTIVE', endsAt: { gt: now } },
        orderBy: [{ position: 'asc' }, { startsAt: 'asc' }],
      }),
      // Terminées et retirées : les plus récentes, pour leur bilan.
      this.prisma.spotlight.findMany({
        ...spotlightWithRelations,
        where: { OR: [{ status: 'WITHDRAWN' }, { endsAt: { lte: now } }] },
        orderBy: { endsAt: 'desc' },
        take: PAST_LIMIT,
      }),
    ]);

    const rows = [...current, ...past];
    const stats = await this.stats.forSpotlights(rows);

    return {
      settings,
      countries: countries.map((country) => ({
        code: country.code,
        name: country.name,
        flag: country.flag,
        isDefault: country.isDefault,
        currency: country.currency,
      })),
      items: rows.map((row) =>
        toSpotlightAdmin(row, stats.get(row.id) ?? EMPTY_SPOTLIGHT_STATS, now),
      ),
      bookings,
    };
  }

  async get(id: string): Promise<SpotlightAdmin> {
    const row = await this.find(id);
    const stats = await this.stats.forSpotlights([row]);
    return toSpotlightAdmin(row, stats.get(row.id) ?? EMPTY_SPOTLIGHT_STATS, new Date());
  }

  /** Événements que le sélecteur propose : publiés, publics, à venir — comme pour la newsletter. */
  searchEvents(search: string | undefined): Promise<NewsletterEvent[]> {
    return searchNewsletterEvents(this.prisma, search);
  }

  async create(input: CreateSpotlightInput, adminId: string): Promise<SpotlightAdmin> {
    const now = new Date();
    await this.countries.requireActive(input.countryCode);
    assertWindow(input.startsAt, input.endsAt, now);

    let data: Prisma.SpotlightUncheckedCreateInput;

    if (input.kind === 'EVENT') {
      await this.assertEventEligible(input.eventId, input.startsAt, input.endsAt, now);

      data = {
        kind: 'EVENT',
        eventId: input.eventId,
        source: input.source,
        countryCode: input.countryCode,
        imageUrl: input.imageUrl ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdById: adminId,
        ...videoColumns(input.video ?? null),
      };
    } else {
      assertExternalDates(input.external.startsAt, input.external.endsAt ?? null);

      data = {
        kind: 'EXTERNAL',
        source: input.source,
        countryCode: input.countryCode,
        imageUrl: input.imageUrl,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdById: adminId,
        ...externalColumns(input.external),
        ...videoColumns(input.video ?? null),
      };
    }

    // Une nouvelle mise en avant se range en fin de une : l'ordre déjà réglé
    // à la main ne bouge pas tout seul.
    const last = await this.prisma.spotlight.aggregate({
      where: { status: 'ACTIVE', endsAt: { gt: now } },
      _max: { position: true },
    });

    const created = await this.prisma.spotlight.create({
      data: { ...data, position: (last._max.position ?? -1) + 1 },
      select: { id: true },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightCreated,
      actorType: 'ADMIN',
      actorUserId: adminId,
      entityType: 'Spotlight',
      entityId: created.id,
      changes: auditSnapshot(data),
    });

    return this.get(created.id);
  }

  async update(id: string, input: UpdateSpotlightInput, adminId: string): Promise<SpotlightAdmin> {
    const now = new Date();
    const row = await this.find(id);

    if (row.status === 'WITHDRAWN') {
      throw new BadRequestException(
        'Une mise en avant retirée ne se modifie plus. Crée-en une nouvelle.',
      );
    }

    // Une place payée se diffuse sur les jours vendus, avec l'événement acheté :
    // la console peut en changer le visuel, pas ce qui a été vendu.
    if (
      row.booking &&
      (input.eventId !== undefined ||
        input.startsAt !== undefined ||
        input.endsAt !== undefined ||
        input.countryCode !== undefined ||
        input.source !== undefined)
    ) {
      throw new BadRequestException(
        'Cette mise en avant est une place achetée : ses dates, son pays et son événement sont ceux de la vente. Retire-la si besoin — les jours restants seront rendus.',
      );
    }

    const startsAt = input.startsAt ?? row.startsAt;
    const endsAt = input.endsAt ?? row.endsAt;

    if (input.startsAt !== undefined || input.endsAt !== undefined) {
      assertWindow(startsAt, endsAt, now);
    }

    if (input.countryCode !== undefined) {
      await this.countries.requireActive(input.countryCode);
    }

    const data: Prisma.SpotlightUncheckedUpdateInput = {
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.startsAt !== undefined ? { startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt } : {}),
      // `null` : la vidéo est retirée, l'image reste.
      ...(input.video !== undefined ? videoColumns(input.video) : {}),
    };

    if (row.kind === 'EVENT') {
      if (input.external !== undefined) {
        throw new BadRequestException('Une mise en avant d’événement n’a pas de fiche externe.');
      }

      const eventId = input.eventId ?? row.eventId;
      if (eventId && (input.eventId !== undefined || input.startsAt || input.endsAt)) {
        await this.assertEventEligible(eventId, startsAt, endsAt, now, row.id);
      }

      if (input.eventId !== undefined) data.eventId = input.eventId;
      // `null` : on revient à la couverture de l'événement.
      if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    } else {
      if (input.eventId !== undefined) {
        throw new BadRequestException('Une mise en avant externe ne désigne pas d’événement.');
      }

      if (input.external !== undefined) {
        assertExternalDates(input.external.startsAt, input.external.endsAt ?? null);
        Object.assign(data, externalColumns(input.external));
      }

      if (input.imageUrl === null) {
        throw new BadRequestException('Un événement externe a besoin de son visuel.');
      }
      if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    }

    await this.prisma.spotlight.update({ where: { id }, data });

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightUpdated,
      actorType: 'ADMIN',
      actorUserId: adminId,
      entityType: 'Spotlight',
      entityId: id,
      changes: auditSnapshot(data),
    });

    return this.get(id);
  }

  /**
   * Retirer avant la fin : la mise en avant quitte la une tout de suite, son
   * bilan reste. Une place payée s'interrompt : ses jours non commencés sont
   * rendus en avoir — sauf décision contraire, motivée.
   */
  async withdraw(
    id: string,
    adminId: string,
    options: WithdrawSpotlightInput = {},
  ): Promise<SpotlightAdmin> {
    const row = await this.find(id);

    if (row.status === 'WITHDRAWN') return this.get(id);

    if (row.booking) {
      await this.bookings.interruptByTeam(id, adminId, {
        compensate: options.compensate !== false,
        reason: options.reason?.trim() || null,
      });
    }

    // Une place payée a déjà quitté la une dans son interruption ; les autres
    // la quittent ici.
    await this.prisma.spotlight.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightWithdrawn,
      actorType: 'ADMIN',
      actorUserId: adminId,
      entityType: 'Spotlight',
      entityId: id,
      changes: row.booking
        ? {
            bookingId: row.booking.id,
            compensate: options.compensate !== false,
            reason: options.reason,
          }
        : undefined,
    });

    return this.get(id);
  }

  /** Nouvel ordre de la une. Les identifiants inconnus ou retirés sont ignorés. */
  async reorder(ids: readonly string[], adminId: string): Promise<void> {
    const unique = [...new Set(ids)];

    await this.prisma.$transaction(
      unique.map((id, position) =>
        this.prisma.spotlight.updateMany({
          where: { id, status: 'ACTIVE' },
          data: { position },
        }),
      ),
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightsReordered,
      actorType: 'ADMIN',
      actorUserId: adminId,
      entityType: 'Spotlight',
      entityId: unique[0] ?? 'none',
      changes: { order: unique },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async find(id: string): Promise<SpotlightRow> {
    const row = await this.prisma.spotlight.findUnique({
      ...spotlightWithRelations,
      where: { id },
    });

    if (!row) {
      throw new NotFoundException('Cette mise en avant n’existe pas.');
    }

    return row;
  }

  /**
   * Un événement qu'on peut mettre à la une : publié, public, pas encore
   * terminé — et pas déjà à la une sur une période qui chevauche celle-ci,
   * ni réservé par son organisateur sur ces jours-là.
   */
  private async assertEventEligible(
    eventId: string,
    startsAt: Date,
    endsAt: Date,
    now: Date,
    excludeSpotlightId?: string,
  ): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { status: true, visibility: true, endsAt: true },
    });

    if (!event) {
      throw new BadRequestException('Cet événement n’existe pas ou a été supprimé.');
    }

    if (event.status === 'SOLD_OUT') {
      throw new BadRequestException('Cet événement est complet : la une n’aurait rien à vendre.');
    }

    if (event.status !== 'PUBLISHED' || event.visibility !== 'PUBLIC') {
      throw new BadRequestException('Seul un événement publié et public peut passer à la une.');
    }

    if (event.endsAt <= now) {
      throw new BadRequestException('Cet événement est déjà passé.');
    }

    const [overlapping, booked] = await Promise.all([
      this.prisma.spotlight.findFirst({
        where: {
          eventId,
          status: 'ACTIVE',
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          ...(excludeSpotlightId ? { id: { not: excludeSpotlightId } } : {}),
        },
        select: { id: true },
      }),
      // Une place achetée en attente de validation ou de paiement retient
      // déjà ces jours pour cet événement.
      this.prisma.spotlightBooking.findFirst({
        where: {
          eventId,
          status: { in: ['AWAITING_PAYMENT', 'PENDING_REVIEW'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { reference: true },
      }),
    ]);

    if (overlapping) {
      throw new BadRequestException('Cet événement est déjà à la une sur une partie de ces dates.');
    }

    if (booked) {
      throw new BadRequestException(
        `Son organisateur a déjà réservé une place sur une partie de ces dates (${booked.reference}).`,
      );
    }
  }
}

function assertWindow(startsAt: Date, endsAt: Date, now: Date): void {
  if (endsAt <= startsAt) {
    throw new BadRequestException('La fin de la mise en avant doit venir après son début.');
  }

  if (endsAt <= now) {
    throw new BadRequestException('Cette période est déjà passée.');
  }
}

function assertExternalDates(startsAt: Date, endsAt: Date | null): void {
  if (endsAt && endsAt < startsAt) {
    throw new BadRequestException('La fin de l’événement doit venir après son début.');
  }
}

function externalColumns(external: SpotlightExternalInput) {
  return {
    externalTitle: external.title,
    externalStartsAt: external.startsAt,
    externalEndsAt: external.endsAt ?? null,
    externalVenueName: external.venueName,
    externalCityName: external.cityName,
    externalOrganizerName: external.organizerName,
    externalUrl: external.url,
    externalPriceLabel: external.priceLabel,
    externalCategoryLabel: external.categoryLabel,
  };
}

/** Les trois colonnes de la vidéo, ensemble — ou toutes vides. */
function videoColumns(video: SpotlightVideo | null) {
  return {
    videoUrl: video?.url ?? null,
    videoPosterUrl: video?.posterUrl ?? null,
    videoDurationSeconds: video?.durationSeconds ?? null,
  };
}

/** Ce que le journal garde d'une écriture : les valeurs, les dates en ISO. */
function auditSnapshot(data: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
}
