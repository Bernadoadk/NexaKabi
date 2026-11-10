import {
  computeSpotlightPhase,
  spotlightRef,
  type SpotlightAdmin,
  type SpotlightSettings,
  type SpotlightSlide,
  type SpotlightStats,
  type SpotlightVideo,
} from '@nexakabi/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { eventWithRelations, toEventSummary } from '../events/events.mapper';

/**
 * Ce qu'il faut lire d'une mise en avant pour l'afficher — dans la une comme
 * dans la console. L'événement vient avec tout ce que la carte du catalogue
 * lit déjà (catégorie, lieu, billets) : le prix d'appel de la une est calculé
 * par la même fonction que celui du catalogue, au franc près.
 */
export const spotlightWithRelations = {
  include: {
    event: eventWithRelations,
    createdBy: { select: { fullName: true } },
    booking: { select: { id: true, reference: true } },
  },
} satisfies Prisma.SpotlightDefaultArgs;

export type SpotlightRow = Prisma.SpotlightGetPayload<typeof spotlightWithRelations>;

/** Teinte de repli d'un événement externe, faute de catégorie : l'encre du design system. */
const EXTERNAL_COLOR = '#1e1a48';

/**
 * Ce qui empêche une mise en avant d'apparaître, alors même que ses dates la
 * placent en ligne. `null` : rien ne l'empêche.
 *
 * Le libellé est écrit pour la console : c'est là qu'on se demande « pourquoi
 * ne la vois-je pas ? ».
 */
export function spotlightHiddenReason(row: SpotlightRow, now: Date): string | null {
  if (row.kind === 'EXTERNAL') {
    const end = row.externalEndsAt ?? row.externalStartsAt;
    return end && end <= now ? 'Événement passé' : null;
  }

  const event = row.event;
  if (!event || event.deletedAt) return 'Événement supprimé';
  if (event.status === 'CANCELLED') return 'Événement annulé';
  if (event.status === 'POSTPONED') return 'Événement reporté';
  if (event.status === 'SOLD_OUT') return 'Événement complet';
  if (event.status !== 'PUBLISHED') return 'Événement non publié';
  if (event.visibility !== 'PUBLIC') return 'Événement privé';
  if (event.endsAt <= now) return 'Événement passé';
  if (toEventSummary(event, now).isSoldOut) return 'Événement complet';

  return null;
}

/** La vidéo d'une ligne, quand ses trois champs sont là (contrainte en base). */
export function spotlightVideoOf(row: {
  videoUrl: string | null;
  videoPosterUrl: string | null;
  videoDurationSeconds: number | null;
}): SpotlightVideo | null {
  return row.videoUrl && row.videoPosterUrl && row.videoDurationSeconds
    ? {
        url: row.videoUrl,
        posterUrl: row.videoPosterUrl,
        durationSeconds: row.videoDurationSeconds,
      }
    : null;
}

/** Le domaine affiché sous une billetterie externe : « billetterie.exemple.bj ». */
export function externalHost(url: string | null): string | null {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * La diapositive publique, ou `null` si la mise en avant ne doit pas paraître.
 *
 * La phase et l'empêchement sont recalculés ici même : la une ne dépend
 * d'aucune tâche planifiée pour cesser d'afficher un événement annulé.
 */
export function toSpotlightSlide(
  row: SpotlightRow,
  settings: SpotlightSettings,
  now: Date,
): SpotlightSlide | null {
  if (computeSpotlightPhase(row, now) !== 'LIVE') return null;
  if (spotlightHiddenReason(row, now) !== null) return null;

  const sponsored = row.source === 'PAID' && settings.showSponsoredLabel;

  if (row.kind === 'EVENT' && row.event) {
    const event = toEventSummary(row.event, now);

    return {
      id: row.id,
      kind: 'EVENT',
      sponsored,
      title: event.title,
      categoryName: event.categoryName,
      categorySlug: event.categorySlug,
      color: event.categoryColor,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venueName: event.venueName,
      cityName: event.cityName,
      imageUrl: row.imageUrl ?? event.coverImageUrl,
      video: spotlightVideoOf(row),
      slug: event.slug,
      fromPrice: event.fromPrice,
      currency: event.currency,
      organizerName: null,
      priceLabel: null,
      externalHost: null,
    };
  }

  if (row.kind === 'EXTERNAL' && row.externalTitle && row.externalStartsAt) {
    return {
      id: row.id,
      kind: 'EXTERNAL',
      sponsored,
      title: row.externalTitle,
      categoryName: row.externalCategoryLabel,
      categorySlug: null,
      color: EXTERNAL_COLOR,
      startsAt: row.externalStartsAt.toISOString(),
      endsAt: row.externalEndsAt?.toISOString() ?? null,
      venueName: row.externalVenueName,
      cityName: row.externalCityName,
      imageUrl: row.imageUrl,
      video: spotlightVideoOf(row),
      slug: null,
      fromPrice: null,
      currency: row.event?.currency ?? 'XOF',
      organizerName: row.externalOrganizerName,
      priceLabel: row.externalPriceLabel,
      externalHost: externalHost(row.externalUrl),
    };
  }

  return null;
}

/**
 * Où mène un clic.
 *
 * Externe : la billetterie officielle, marquée `utm_source=nexakabi` — le
 * partenaire voit ainsi dans ses propres statistiques ce que la une lui
 * apporte, et c'est l'argument qui le fera venir vendre chez nous. Un
 * marquage déjà présent dans le lien saisi est respecté.
 *
 * Plateforme : la page de l'événement, avec la provenance qui suivra la
 * commande.
 */
export function spotlightTarget(row: {
  id: string;
  kind: 'EVENT' | 'EXTERNAL';
  externalUrl: string | null;
  event: { slug: string } | null;
}): string | null {
  if (row.kind === 'EXTERNAL') {
    if (!row.externalUrl) return null;

    try {
      const url = new URL(row.externalUrl);
      if (url.protocol !== 'https:') return null;
      if (!url.searchParams.has('utm_source')) {
        url.searchParams.set('utm_source', 'nexakabi');
        url.searchParams.set('utm_medium', 'a-la-une');
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  return row.event ? `/e/${row.event.slug}?ref=${spotlightRef(row.id)}` : null;
}

/** La fiche de la console. */
export function toSpotlightAdmin(
  row: SpotlightRow,
  stats: SpotlightStats,
  now: Date,
): SpotlightAdmin {
  const phase = computeSpotlightPhase(row, now);
  const event = row.event;

  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    phase,
    hiddenReason: phase === 'LIVE' ? spotlightHiddenReason(row, now) : null,
    position: row.position,
    countryCode: row.countryCode,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    title:
      row.kind === 'EVENT' ? (event?.title ?? 'Événement supprimé') : (row.externalTitle ?? ''),
    displayImageUrl: row.imageUrl ?? event?.coverImageUrl ?? null,
    imageUrl: row.imageUrl,
    video: spotlightVideoOf(row),
    bookingId: row.booking?.id ?? null,
    bookingReference: row.booking?.reference ?? null,
    event: event
      ? {
          id: event.id,
          slug: event.slug,
          title: event.title,
          startsAt: event.startsAt.toISOString(),
          status: event.status,
          organizationName: event.organization.name,
          coverImageUrl: event.coverImageUrl,
          cityName: event.city?.name ?? null,
        }
      : null,
    external:
      row.kind === 'EXTERNAL' && row.externalTitle && row.externalStartsAt
        ? {
            title: row.externalTitle,
            startsAt: row.externalStartsAt.toISOString(),
            endsAt: row.externalEndsAt?.toISOString() ?? null,
            venueName: row.externalVenueName,
            cityName: row.externalCityName,
            organizerName: row.externalOrganizerName ?? '',
            url: row.externalUrl ?? '',
            priceLabel: row.externalPriceLabel,
            categoryLabel: row.externalCategoryLabel,
          }
        : null,
    stats,
    createdByName: row.createdBy.fullName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
