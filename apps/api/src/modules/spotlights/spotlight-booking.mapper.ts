import {
  computeSpotlightBookingPhase,
  type SpotlightBooking,
  type SpotlightBookingAdmin,
  type SpotlightSettings,
  type SpotlightSlide,
  type SpotlightStats,
} from '@nexakabi/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { eventWithRelations, toEventSummary } from '../events/events.mapper';
import { spotlightVideoOf } from './spotlights.mapper';

/** Ce qu'il faut lire d'une place pour l'afficher, côté organisateur comme côté console. */
export const bookingWithRelations = {
  include: {
    event: {
      select: {
        id: true,
        slug: true,
        title: true,
        startsAt: true,
        status: true,
        coverImageUrl: true,
      },
    },
    organization: { select: { id: true, name: true, verificationStatus: true } },
    requestedBy: { select: { fullName: true } },
    reviewedBy: { select: { fullName: true } },
    spotlight: { select: { id: true, kind: true } },
  },
} satisfies Prisma.SpotlightBookingDefaultArgs;

export type BookingRow = Prisma.SpotlightBookingGetPayload<typeof bookingWithRelations>;

type EventRow = Prisma.EventGetPayload<typeof eventWithRelations>;

/** `AAAA-MM-JJ` d'une colonne `DATE` (lue à minuit UTC). */
export function dayOf(column: Date): string {
  return column.toISOString().slice(0, 10);
}

/** Une colonne `DATE` depuis `AAAA-MM-JJ`. */
export function dateColumn(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** Les jours d'une place restent réservés ce temps après la fin du délai de paiement. */
export const PAYMENT_GRACE_MS = 10 * 60 * 1000;

export function toSpotlightBooking(
  row: BookingRow,
  stats: SpotlightStats | null,
  now: Date,
): SpotlightBooking {
  const live = row.status === 'APPROVED' && row.endsAt > now;

  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    phase: computeSpotlightBookingPhase(row, now),
    eventId: row.eventId,
    eventTitle: row.event.title,
    countryCode: row.countryCode,
    startDay: dayOf(row.startDay),
    endDay: dayOf(row.endDay),
    days: row.days,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    pricePerDay: row.pricePerDay,
    totalAmount: row.totalAmount,
    creditAmount: row.creditAmount,
    chargedAmount: row.chargedAmount,
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    paidAt: row.paidAt?.toISOString() ?? null,
    holdExpiresAt:
      row.status === 'AWAITING_PAYMENT' ? (row.holdExpiresAt?.toISOString() ?? null) : null,
    imageUrl: row.imageUrl,
    video: spotlightVideoOf(row),
    rejectionReason: row.rejectionReason,
    interruptionReason: row.interruptionReason,
    refundedAmount: row.refundedAmount,
    creditedAmount: row.creditedAmount,
    stats,
    canCancel: row.status === 'AWAITING_PAYMENT' || row.status === 'PENDING_REVIEW' || live,
    canPay:
      row.status === 'AWAITING_PAYMENT' &&
      row.paymentMethod === 'PROVIDER' &&
      row.holdExpiresAt !== null &&
      row.holdExpiresAt > now,
    hasReceipt: row.paidAt !== null,
    requestedByName: row.requestedBy.fullName,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export function toSpotlightBookingAdmin(
  row: BookingRow,
  stats: SpotlightStats | null,
  now: Date,
  preview: SpotlightSlide | null,
): SpotlightBookingAdmin {
  return {
    ...toSpotlightBooking(row, stats, now),
    organization: {
      id: row.organization.id,
      name: row.organization.name,
      verified: row.organization.verificationStatus === 'VERIFIED',
    },
    event: {
      id: row.event.id,
      slug: row.event.slug,
      title: row.event.title,
      startsAt: row.event.startsAt.toISOString(),
      status: row.event.status,
      coverImageUrl: row.event.coverImageUrl,
    },
    spotlightId: row.spotlightId,
    reviewedByName: row.reviewedBy?.fullName ?? null,
    preview,
  };
}

/**
 * La diapositive d'une place, telle que la une la montrera — visuel propre ou
 * couverture, vidéo, prix d'appel calculé comme au catalogue. C'est l'aperçu
 * que voient l'organisateur avant de payer et l'équipe avant de valider.
 */
export function bookingPreview(
  event: EventRow,
  visual: {
    id: string;
    imageUrl: string | null;
    videoUrl: string | null;
    videoPosterUrl: string | null;
    videoDurationSeconds: number | null;
  },
  settings: SpotlightSettings,
  now: Date,
): SpotlightSlide {
  const summary = toEventSummary(event, now);

  return {
    id: visual.id,
    kind: 'EVENT',
    sponsored: settings.showSponsoredLabel,
    title: summary.title,
    categoryName: summary.categoryName,
    categorySlug: summary.categorySlug,
    color: summary.categoryColor,
    startsAt: summary.startsAt,
    endsAt: summary.endsAt,
    venueName: summary.venueName,
    cityName: summary.cityName,
    imageUrl: visual.imageUrl ?? summary.coverImageUrl,
    video: spotlightVideoOf(visual),
    slug: summary.slug,
    fromPrice: summary.fromPrice,
    currency: summary.currency,
    organizerName: null,
    priceLabel: null,
    externalHost: null,
  };
}
