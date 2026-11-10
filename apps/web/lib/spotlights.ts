import 'server-only';
import {
  EMPTY_SPOTLIGHT_FEED,
  spotlightRef,
  type SpotlightFeed,
  type SpotlightSlide,
} from '@nexakabi/contracts';
import {
  formatEventCaption,
  formatEventCaptionWithTime,
  formatMoney,
  formatTimeCompact,
} from '@nexakabi/utils';
import type { SpotlightView } from '@/components/spotlight-carousel';
import { apiFetch } from './api';

/** Même tolérance que le catalogue : une minute de décalage, au plus. */
const SPOTLIGHT_REVALIDATE_SECONDS = 60;

export interface SpotlightCarouselData {
  slideSeconds: number;
  slides: SpotlightView[];
}

/**
 * La une, prête à afficher.
 *
 * Les dates, les prix et les liens sont mis en forme ICI, côté serveur, comme
 * pour les cartes du catalogue : le carrousel est un composant client, et une
 * date formatée dans le navigateur ne donnerait pas forcément le même texte
 * qu'au rendu serveur — le contenu sauterait à l'hydratation.
 *
 * Une API injoignable donne une une vide : la section disparaît, la page reste.
 */
export async function fetchSpotlights(): Promise<SpotlightCarouselData> {
  const result = await apiFetch<SpotlightFeed>('/spotlights', {
    revalidate: SPOTLIGHT_REVALIDATE_SECONDS,
  });

  const feed = result.ok ? result.data : EMPTY_SPOTLIGHT_FEED;

  return { slideSeconds: feed.slideSeconds, slides: feed.slides.map(toSpotlightView) };
}

/**
 * Une diapositive mise en forme pour le carrousel — exportée pour l'aperçu de
 * l'espace organisateur, qui doit montrer EXACTEMENT ce que la une affichera.
 */
export function toSpotlightView(slide: SpotlightSlide): SpotlightView {
  const startsAt = new Date(slide.startsAt);
  const endsAt = slide.endsAt ? new Date(slide.endsAt) : null;
  const place = [slide.venueName, slide.cityName].filter(Boolean).join(' · ') || null;

  if (slide.kind === 'EXTERNAL') {
    // Plusieurs jours : « sam. 26 déc. → lun. 28 déc. ». Un seul : l'heure.
    const spansDays =
      endsAt !== null && formatEventCaption(endsAt) !== formatEventCaption(startsAt);

    return {
      id: slide.id,
      kind: 'EXTERNAL',
      sponsored: slide.sponsored,
      title: slide.title,
      categoryName: slide.categoryName,
      color: slide.color,
      dateLabel:
        endsAt && spansDays
          ? `${formatEventCaption(startsAt)} → ${formatEventCaption(endsAt)}`
          : `${formatEventCaption(startsAt)} · ${formatTimeCompact(startsAt)}`,
      placeLabel: place,
      priceLabel: slide.priceLabel,
      imageUrl: slide.imageUrl,
      video: slide.video,
      // Une route du site, qui compte le clic puis redirige : le lien
      // fonctionne même sans JavaScript.
      href: `/go/une/${encodeURIComponent(slide.id)}`,
      ctaLabel: 'Billets sur le site officiel',
      external: { organizerName: slide.organizerName ?? '', host: slide.externalHost },
    };
  }

  const isFree = slide.fromPrice === 0;

  return {
    id: slide.id,
    kind: 'EVENT',
    sponsored: slide.sponsored,
    title: slide.title,
    categoryName: slide.categoryName,
    color: slide.color,
    dateLabel: formatEventCaptionWithTime(startsAt),
    placeLabel: place,
    priceLabel:
      slide.fromPrice === null
        ? null
        : isFree
          ? 'Gratuit'
          : `Dès ${formatMoney(slide.fromPrice, slide.currency)}`,
    imageUrl: slide.imageUrl,
    video: slide.video,
    href: `/e/${encodeURIComponent(slide.slug ?? '')}?ref=${spotlightRef(slide.id)}`,
    ctaLabel:
      slide.fromPrice === null
        ? 'Voir l’événement'
        : isFree
          ? 'Réserver ma place'
          : 'Prendre mon billet',
    external: null,
  };
}
