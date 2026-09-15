import {
  DEFAULT_COMMISSION_POLICY,
  computeFeeBreakdown,
  computeTicketAvailability,
  isAlmostSoldOut,
  type EventDetail,
  type EventSummary,
  type TicketTypeView,
} from '@nexakabi/contracts';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Traduction des lignes de base vers les représentations du contrat.
 *
 * Isolé du service : ces fonctions sont pures, donc testables sans base, et
 * garantissent qu'aucun champ interne ne fuit vers le client — le code d'accès
 * d'un billet caché, par exemple, ne doit jamais quitter le serveur.
 */

export const eventWithRelations = {
  include: {
    category: true,
    city: true,
    venue: true,
    organization: true,
    ticketTypes: {
      where: { deletedAt: null },
      orderBy: [{ position: 'asc' }, { price: 'asc' }],
    },
    images: {
      where: { type: 'FLOOR_PLAN' },
      orderBy: { position: 'asc' },
    },
  },
} satisfies Prisma.EventDefaultArgs;

type EventRow = Prisma.EventGetPayload<typeof eventWithRelations>;
type TicketTypeRow = EventRow['ticketTypes'][number];

export function toTicketTypeView(row: TicketTypeRow, now = new Date()): TicketTypeView {
  const availability = computeTicketAvailability(
    {
      quantityTotal: row.quantityTotal,
      quantitySold: row.quantitySold,
      quantityReserved: row.quantityReserved,
      status: row.status,
      salesStartAt: row.salesStartAt,
      salesEndAt: row.salesEndAt,
    },
    now,
  );

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    currency: row.currency,
    quantityTotal: row.quantityTotal,
    quantitySold: row.quantitySold,
    remaining: availability.remaining,
    minPerOrder: row.minPerOrder,
    maxPerOrder: row.maxPerOrder,
    salesStartAt: row.salesStartAt?.toISOString() ?? null,
    salesEndAt: row.salesEndAt?.toISOString() ?? null,
    status: row.status,
    visibility: row.visibility,
    available: availability.available,
    availabilityLabel: availability.label,
  };
}

/**
 * Prix d'appel et frais annoncés dès la carte.
 *
 * Le montant affiché sur la carte, dans la sélection et au récapitulatif est
 * strictement le même : c'est une règle produit, pas une option d'affichage.
 */
function computeEntryPrice(
  ticketTypes: readonly TicketTypeRow[],
  now: Date,
): {
  fromPrice: number | null;
  feeAmount: number | null;
} {
  // Seules les catégories RÉELLEMENT ACHETABLES entrent dans le prix d'appel.
  // Annoncer « à partir de 3 000 FCFA » alors que ce tarif est un early bird
  // clôturé serait trompeur : le montant vu sur la carte doit être celui qu'on
  // paiera au récapitulatif.
  const sellable = ticketTypes.filter(
    (ticket) =>
      ticket.visibility === 'PUBLIC' &&
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

  // Événement complet : on retombe sur les tarifs publics pour ne pas afficher
  // une carte sans prix.
  const pool =
    sellable.length > 0 ? sellable : ticketTypes.filter((t) => t.visibility === 'PUBLIC');

  if (pool.length === 0) return { fromPrice: null, feeAmount: null };

  const fromPrice = Math.min(...pool.map((ticket) => ticket.price));

  if (fromPrice === 0) return { fromPrice: 0, feeAmount: null };

  const breakdown = computeFeeBreakdown({
    lines: [{ unitPrice: fromPrice, quantity: 1 }],
    policy: DEFAULT_COMMISSION_POLICY,
  });

  return { fromPrice, feeAmount: breakdown.buyerFeeAmount || null };
}

export function toEventSummary(row: EventRow, now = new Date()): EventSummary {
  const visible = row.ticketTypes.filter((ticket) => ticket.visibility === 'PUBLIC');
  const { fromPrice, feeAmount } = computeEntryPrice(row.ticketTypes, now);

  const remainingSeats = visible.reduce((total, ticket) => {
    const availability = computeTicketAvailability(
      {
        quantityTotal: ticket.quantityTotal,
        quantitySold: ticket.quantitySold,
        quantityReserved: ticket.quantityReserved,
        status: ticket.status,
        salesStartAt: ticket.salesStartAt,
        salesEndAt: ticket.salesEndAt,
      },
      now,
    );
    return total + availability.remaining;
  }, 0);

  const almostSoldOut =
    visible.length > 0 &&
    visible.every((ticket) =>
      isAlmostSoldOut({
        quantityTotal: ticket.quantityTotal,
        quantitySold: ticket.quantitySold,
        quantityReserved: ticket.quantityReserved,
        status: ticket.status,
      }),
    );

  return {
    id: row.id,
    slug: row.slug,
    shortCode: row.shortCode,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    visibility: row.visibility,
    coverImageUrl: row.coverImageUrl,
    categoryName: row.category.name,
    categorySlug: row.category.slug,
    categoryColor: row.category.colorToken,
    cityName: row.city?.name ?? null,
    venueName: row.venue?.name ?? null,
    latitude: row.venue?.latitude ?? null,
    longitude: row.venue?.longitude ?? null,
    organizationName: row.organization.name,
    organizationSlug: row.organization.slug,
    fromPrice,
    feeAmount,
    remainingSeats: visible.length > 0 ? remainingSeats : null,
    isSoldOut: row.status === 'SOLD_OUT' || (visible.length > 0 && remainingSeats === 0),
    isAlmostSoldOut: almostSoldOut,
    minimumAge: row.minimumAge,
  };
}

export function toEventDetail(row: EventRow, now = new Date()): EventDetail {
  return {
    ...toEventSummary(row, now),
    subtitle: row.subtitle,
    description: row.description,
    format: row.format,
    doorsOpenAt: row.doorsOpenAt?.toISOString() ?? null,
    address: row.venue?.address ?? null,
    onlinePlatform: row.onlinePlatform,
    refundPolicy: row.refundPolicy,
    refundDeadlineDays: row.refundDeadlineDays,
    requiresAttendeeName: row.requiresAttendeeName,
    maxTicketsPerOrder: row.maxTicketsPerOrder,
    accessInstructions: row.accessInstructions,
    floorPlanUrls: row.images.map((image) => image.url),
    organizationLogoUrl: row.organization.logoUrl,
    organizationVerified: row.organization.verificationStatus === 'VERIFIED',
    // Les billets cachés — partenaire, presse — ne sont jamais listés
    // publiquement : ils s'atteignent par lien ou par code.
    ticketTypes: row.ticketTypes
      .filter((ticket) => ticket.visibility === 'PUBLIC')
      .map((ticket) => toTicketTypeView(ticket, now)),
  };
}

/** Vue organisateur : les billets cachés y figurent, contrairement à la vue publique. */
export function toOrganizerEventDetail(row: EventRow, now = new Date()): EventDetail {
  return {
    ...toEventDetail(row, now),
    draftStep: draftStepOf(row),
    ticketTypes: row.ticketTypes.map((ticket) => toTicketTypeView(ticket, now)),
  };
}

/** Vue organisateur d'une ligne de liste : le résumé public, plus l'étape en cours et les ventes. */
export function toOrganizerEventSummary(row: EventRow, now = new Date()): EventSummary {
  return {
    ...toEventSummary(row, now),
    draftStep: draftStepOf(row),
    ticketsSold: countTicketsSold(row),
  };
}

/** Billets vendus, toutes catégories confondues, cachées comprises. */
export function countTicketsSold(row: EventRow): number {
  return row.ticketTypes.reduce((total, ticket) => total + ticket.quantitySold, 0);
}

/** La colonne est nullable pour les lignes antérieures à l'assistant : elles partent de l'étape 1. */
function draftStepOf(row: EventRow): number {
  return Math.min(8, Math.max(1, row.draftStep ?? 1));
}
