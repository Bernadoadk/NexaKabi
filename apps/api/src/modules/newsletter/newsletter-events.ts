import { computeTicketAvailability, type NewsletterEvent } from '@nexakabi/contracts';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';

/** Ce qu'il faut lire d'un événement pour le montrer dans une campagne. */
const NEWSLETTER_EVENT_SELECT = {
  id: true,
  slug: true,
  title: true,
  startsAt: true,
  status: true,
  currency: true,
  coverImageUrl: true,
  organization: { select: { name: true } },
  city: { select: { name: true } },
  venue: { select: { name: true } },
  ticketTypes: {
    where: { deletedAt: null, visibility: 'PUBLIC' },
    select: {
      price: true,
      status: true,
      quantityTotal: true,
      quantitySold: true,
      quantityReserved: true,
      salesStartAt: true,
      salesEndAt: true,
    },
  },
} satisfies Prisma.EventSelect;

type NewsletterEventRow = Prisma.EventGetPayload<{ select: typeof NEWSLETTER_EVENT_SELECT }>;

type EventReader = Pick<PrismaClient, 'event'>;

/**
 * Les événements d'une campagne, dans l'ordre choisi.
 *
 * Un événement supprimé depuis est simplement omis : la campagne ne doit pas
 * échouer parce qu'un organisateur a retiré ce qu'elle mettait en avant.
 */
export async function loadNewsletterEvents(
  prisma: EventReader,
  eventIds: readonly string[],
  now = new Date(),
): Promise<NewsletterEvent[]> {
  if (eventIds.length === 0) return [];

  const rows = await prisma.event.findMany({
    where: { id: { in: [...eventIds] }, deletedAt: null },
    select: NEWSLETTER_EVENT_SELECT,
  });

  const byId = new Map(rows.map((row) => [row.id, row]));

  return eventIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toNewsletterEvent(row, now)] : [];
  });
}

/**
 * Événements que le sélecteur de la console propose : publiés, publics, à venir.
 *
 * La recherche porte sur le titre et l'organisation — ce qu'on a en tête en
 * composant « les concerts de la semaine ».
 */
export async function searchNewsletterEvents(
  prisma: EventReader,
  search: string | undefined,
  now = new Date(),
): Promise<NewsletterEvent[]> {
  const q = search?.trim();

  const rows = await prisma.event.findMany({
    where: {
      deletedAt: null,
      visibility: 'PUBLIC',
      status: { in: ['PUBLISHED', 'SOLD_OUT'] },
      startsAt: { gt: now },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { organization: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { startsAt: 'asc' },
    take: 40,
    select: NEWSLETTER_EVENT_SELECT,
  });

  return rows.map((row) => toNewsletterEvent(row, now));
}

function toNewsletterEvent(row: NewsletterEventRow, now: Date): NewsletterEvent {
  // Même règle que la carte du catalogue : le prix annoncé est celui d'un
  // billet qu'on peut réellement acheter, sinon celui des billets publics.
  const sellable = row.ticketTypes.filter(
    (ticket) =>
      computeTicketAvailability(
        {
          quantityTotal: ticket.quantityTotal,
          quantitySold: ticket.quantitySold,
          quantityReserved: ticket.quantityReserved,
          status: ticket.status,
          salesStartAt: ticket.salesStartAt,
          salesEndAt: ticket.salesEndAt,
        },
        now,
      ).available,
  );
  const pool = sellable.length > 0 ? sellable : row.ticketTypes;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    status: row.status,
    organizationName: row.organization.name,
    cityName: row.city?.name ?? null,
    venueName: row.venue?.name ?? null,
    coverImageUrl: row.coverImageUrl,
    fromPrice: pool.length > 0 ? Math.min(...pool.map((ticket) => ticket.price)) : null,
    currency: row.currency,
  };
}
