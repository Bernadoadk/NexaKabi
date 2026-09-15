import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  resolveDateRange,
  type DiscoveryQuery,
  type EventDetail,
  type EventMapPin,
  type EventSummary,
  type PaginatedResult,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { eventWithRelations, toEventDetail, toEventSummary } from './events.mapper';

/**
 * Découverte publique.
 *
 * C'est le chemin le plus emprunté du produit et celui qui reçoit le trafic
 * WhatsApp. Toutes les requêtes d'ici doivent rester servables depuis un cache
 * et tenir dans le budget de 150 Ko du premier écran.
 */
@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtre de base : seuls les événements publiés, publics et à venir. */
  private publicWhere(now: Date): Prisma.EventWhereInput {
    return {
      deletedAt: null,
      visibility: 'PUBLIC',
      status: { in: ['PUBLISHED', 'SOLD_OUT'] },
      endsAt: { gte: now },
    };
  }

  async search(query: DiscoveryQuery): Promise<PaginatedResult<EventSummary>> {
    const now = new Date();
    const where: Prisma.EventWhereInput = { ...this.publicWhere(now) };

    if (query.ville) {
      where.city = { slug: query.ville };
    }

    if (query.cat) {
      where.category = { slug: query.cat };
    }

    if (query.format) {
      where.format = query.format;
    }

    const range = resolveDateRange(query.date, now);
    if (range) {
      where.startsAt = { gte: range.from, lte: range.to };
    }

    if (query.prix === 'gratuit') {
      where.ticketTypes = { some: { price: 0, deletedAt: null, visibility: 'PUBLIC' } };
    } else if (query.prix === 'payant') {
      where.ticketTypes = { some: { price: { gt: 0 }, deletedAt: null, visibility: 'PUBLIC' } };
    }

    if (query.q) {
      // Recherche simple par sous-chaîne, insensible à la casse. La recherche
      // plein texte française (index GIN déjà en place) prendra le relais quand
      // le volume le justifiera : à ce stade, elle coûterait en complexité sans
      // rien améliorer pour l'utilisateur.
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { subtitle: { contains: query.q, mode: 'insensitive' } },
        { organization: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        ...eventWithRelations,
        where,
        orderBy: { startsAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => toEventSummary(row, now)),
      total,
      { page: query.page, pageSize: query.pageSize },
    );
  }

  /**
   * Sections éditorialisées de l'accueil.
   *
   * Une seule requête par section plutôt qu'un chargement global filtré côté
   * application : chaque section a son propre tri, et le catalogue peut devenir
   * volumineux.
   */
  async homeSections(cityCitySlug?: string): Promise<{
    upcoming: EventSummary[];
    thisWeekend: EventSummary[];
    free: EventSummary[];
  }> {
    const now = new Date();
    const base = this.publicWhere(now);
    const city = cityCitySlug ? { city: { slug: cityCitySlug } } : {};
    const weekend = resolveDateRange('this_weekend', now);

    const [upcoming, thisWeekend, free] = await Promise.all([
      this.prisma.event.findMany({
        ...eventWithRelations,
        where: { ...base, ...city },
        orderBy: { startsAt: 'asc' },
        take: 8,
      }),
      this.prisma.event.findMany({
        ...eventWithRelations,
        where: weekend
          ? { ...base, ...city, startsAt: { gte: weekend.from, lte: weekend.to } }
          : { ...base, ...city },
        orderBy: { startsAt: 'asc' },
        take: 4,
      }),
      this.prisma.event.findMany({
        ...eventWithRelations,
        where: {
          ...base,
          ...city,
          ticketTypes: { some: { price: 0, deletedAt: null, visibility: 'PUBLIC' } },
        },
        orderBy: { startsAt: 'asc' },
        take: 4,
      }),
    ]);

    return {
      upcoming: upcoming.map((row) => toEventSummary(row, now)),
      thisWeekend: thisWeekend.map((row) => toEventSummary(row, now)),
      free: free.map((row) => toEventSummary(row, now)),
    };
  }

  /**
   * Page événement.
   *
   * Un événement PRIVÉ reste accessible par son lien : c'est le principe même
   * d'un événement sur invitation. Seul le référencement lui est refusé.
   */
  /**
   * Événements à venir, localisés, pour la carte.
   *
   * ── Pourquoi tout et pas une zone ───────────────────────────────────────
   * Le Bénin tient dans un rectangle de 300 km sur 700 ; à l'échelle du
   * lancement, la liste complète des événements à venir se compte en dizaines,
   * au pire en centaines. Une épingle pèse 300 octets : renvoyer tout coûte
   * moins qu'une requête par déplacement de carte, et la proximité se calcule
   * sur le téléphone, avec la position que le participant a bien voulu donner.
   * Un découpage par zone attendra qu'il y ait de quoi le justifier.
   *
   * Les événements sans coordonnées — lieu saisi à la main, sans recherche —
   * n'y figurent pas : ils restent dans le catalogue, pas sur la carte.
   */
  async mapPins(now = new Date()): Promise<EventMapPin[]> {
    const rows = await this.prisma.event.findMany({
      ...eventWithRelations,
      where: {
        status: { in: ['PUBLISHED', 'SOLD_OUT'] },
        visibility: 'PUBLIC',
        deletedAt: null,
        endsAt: { gte: now },
        venue: { latitude: { not: null }, longitude: { not: null } },
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });

    return rows.flatMap((row) => {
      if (row.venue?.latitude == null || row.venue.longitude == null) return [];

      const summary = toEventSummary(row, now);

      return [
        {
          id: row.id,
          slug: row.slug,
          title: row.title,
          latitude: row.venue.latitude,
          longitude: row.venue.longitude,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          categoryName: row.category.name,
          categorySlug: row.category.slug,
          categoryColor: row.category.colorToken,
          coverImageUrl: row.coverImageUrl,
          venueName: row.venue.name,
          address: row.venue.address ?? null,
          cityName: row.city?.name ?? null,
          fromPrice: summary.fromPrice,
          isSoldOut: summary.isSoldOut,
        },
      ];
    });
  }

  async findBySlug(slug: string): Promise<EventDetail> {
    const now = new Date();

    const event = await this.prisma.event.findFirst({
      ...eventWithRelations,
      where: {
        slug,
        deletedAt: null,
        status: { in: ['PUBLISHED', 'SOLD_OUT', 'POSTPONED', 'CANCELLED', 'COMPLETED'] },
      },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas ou n'est plus en ligne.");
    }

    return toEventDetail(event, now);
  }

  /** Page publique d'un organisateur. */
  async findByOrganization(slug: string): Promise<{
    organization: {
      name: string;
      slug: string;
      description: string | null;
      logoUrl: string | null;
      cityName: string | null;
      verified: boolean;
      whatsapp: string | null;
    };
    upcoming: EventSummary[];
    past: EventSummary[];
  }> {
    const now = new Date();

    const organization = await this.prisma.organization.findFirst({
      where: { slug, deletedAt: null, status: 'ACTIVE' },
    });

    if (!organization) {
      throw new NotFoundException("Cet organisateur n'existe pas.");
    }

    const [upcoming, past] = await Promise.all([
      this.prisma.event.findMany({
        ...eventWithRelations,
        where: { ...this.publicWhere(now), organizationId: organization.id },
        orderBy: { startsAt: 'asc' },
        take: 12,
      }),
      this.prisma.event.findMany({
        ...eventWithRelations,
        where: {
          organizationId: organization.id,
          deletedAt: null,
          visibility: 'PUBLIC',
          status: { in: ['COMPLETED', 'PUBLISHED', 'SOLD_OUT'] },
          endsAt: { lt: now },
        },
        orderBy: { startsAt: 'desc' },
        take: 6,
      }),
    ]);

    return {
      organization: {
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
        logoUrl: organization.logoUrl,
        cityName: organization.cityName,
        verified: organization.verificationStatus === 'VERIFIED',
        whatsapp: organization.whatsapp,
      },
      upcoming: upcoming.map((row) => toEventSummary(row, now)),
      past: past.map((row) => toEventSummary(row, now)),
    };
  }

  listCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { position: 'asc' },
      select: { id: true, slug: true, name: true, colorToken: true, icon: true },
    });
  }

  listCities() {
    return this.prisma.city.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
      select: { id: true, slug: true, name: true },
    });
  }

  /** Slugs publiés, pour le plan du site. */
  listPublishedSlugs() {
    return this.prisma.event.findMany({
      where: this.publicWhere(new Date()),
      select: { slug: true, updatedAt: true },
      orderBy: { startsAt: 'asc' },
      take: 5000,
    });
  }
}
