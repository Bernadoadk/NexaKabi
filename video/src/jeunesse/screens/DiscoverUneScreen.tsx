import React from 'react';
import { Map as MapIcon, Pause, Search, SlidersHorizontal } from 'lucide-react';
import { config } from '../../config';
import type { DemoEvent } from '../../config.types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EventCardStandard } from '../../components/ui/EventCard';
import { EventCover } from '../../components/ui/EventCover';
import { StatusSpacer } from '../../components/motion/Frames';
import { findEvent, formatEventCaptionWithTime, formatMoney, parseDate } from '../../lib/format';
import { BottomNav, PublicHeader } from '../../screens/shared';
import { jeunesse } from '../config';

/** Largeur d'une diapositive sur téléphone : 86 % de la piste (360 − 2 × 16). */
export const SLIDE = { width: 282, gap: 10, height: 360 } as const;

/**
 * Découvrir, mobile (`app/(public)/evenements/page.tsx`), avec la une en tête :
 * le carrousel de `components/spotlight-carousel.tsx`. Les diapositives font
 * 86 % de la largeur, la suivante se devine ; dessous, une barre par
 * diapositive, « 1 / 4 » et le bouton pause.
 */
export const DiscoverUneScreen: React.FC<{
  /** Position de la piste, en diapositives (fractionnaire pendant un glissement). */
  position: number;
  /** Diapositive en cours (barres, compteur). */
  active: number;
  /** Remplissage de la barre de la diapositive en cours (0 → 1). */
  progress: number;
  scroll?: number;
  /** Bouton « Prendre mon billet » de la diapositive en cours enfoncé (0 → 1). */
  ctaPress?: number;
}> = ({ position, active, progress, scroll = 0, ctaPress = 0 }) => {
  const slides = jeunesse.data.spotlight.map((entry) => ({
    event: findEvent(entry.id),
    sponsored: entry.sponsored,
  }));
  const next = findEvent('marche');

  return (
    <div className="relative flex h-full flex-col bg-paper">
      <div className="relative z-20">
        <StatusSpacer />
        <PublicHeader />
      </div>

      <div
        className="relative z-0 flex flex-col gap-5 px-4 py-6"
        style={{ transform: `translateY(${-scroll}px)` }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-h1 font-bold">Découvrir</h1>
          <p className="m-0 text-body-l text-text-2">
            {config.data.discover.upcomingCount} événements à venir
          </p>
        </div>

        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-text-3" />
          <div className="flex min-h-[48px] w-full items-center rounded-field border border-border-field bg-surface pl-10 pr-3.5 text-[15px] text-text-3">
            Concert, formation, artiste, lieu…
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 font-display text-h2 font-bold">À la une</h2>
          <div className="relative -mx-4 overflow-hidden px-4">
            <div
              className="flex"
              style={{
                gap: SLIDE.gap,
                transform: `translateX(${-position * (SLIDE.width + SLIDE.gap)}px)`,
              }}
            >
              {slides.map((slide, index) => (
                <div key={slide.event.id} className="shrink-0" style={{ width: SLIDE.width }}>
                  <SpotlightSlide
                    event={slide.event}
                    sponsored={slide.sponsored}
                    press={index === active ? ctaPress : 0}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-1 gap-1.5">
              {slides.map((slide, index) => (
                <span
                  key={slide.event.id}
                  className="relative h-1 flex-1 overflow-hidden rounded-full bg-border"
                >
                  <span
                    className="absolute inset-0 origin-left rounded-full bg-coral"
                    style={{
                      transform: `scaleX(${index < active ? 1 : index === active ? progress : 0})`,
                    }}
                  />
                </span>
              ))}
            </div>
            <span className="min-w-[52px] text-right text-micro font-bold text-text-2">
              {active + 1} / {slides.length}
            </span>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-text-strong">
              <Pause className="size-4" />
            </span>
          </div>
        </section>

        <div className="flex items-center gap-2">
          <Button variant="ink" className="shrink-0">
            <SlidersHorizontal className="size-4" />
            Filtres
          </Button>
          <Button variant="secondary" className="shrink-0">
            <MapIcon className="size-4" />
            Carte
          </Button>
          <span className="ml-auto text-body-s text-text-2">
            {config.data.discover.upcomingCount} résultats
          </span>
        </div>

        <EventCardStandard event={next} />
      </div>

      <BottomNav active="Découvrir" />
    </div>
  );
};

/** Une diapositive de la une (`Slide` dans `spotlight-carousel.tsx`), événement vendu chez nous. */
export const SpotlightSlide: React.FC<{
  event: DemoEvent;
  sponsored: boolean;
  press?: number;
}> = ({ event, sponsored, press = 0 }) => {
  const free = event.price === 0;
  return (
    <div
      className="relative overflow-hidden rounded-[20px] bg-ink text-white"
      style={{ height: SLIDE.height }}
    >
      <div className="absolute inset-0" style={{ background: config.categories[event.category].color }}>
        <EventCover event={event} />
      </div>
      <div className="ink-scrim absolute inset-0" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgb(18 16 43 / 0.5) 0%, rgb(18 16 43 / 0.35) 60%, rgb(18 16 43 / 0.12) 100%)',
        }}
      />

      {sponsored ? (
        <span className="absolute left-4 top-4 rounded-chip bg-black/45 px-2 py-1 text-micro font-semibold text-white/90">
          Sponsorisé
        </span>
      ) : null}

      <div className="absolute inset-x-4 bottom-4 flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="overlay">{config.categories[event.category].name}</Badge>
        </div>
        <p className="eyebrow m-0 text-coral-200">
          {formatEventCaptionWithTime(parseDate(event.start))}
        </p>
        <h3 className="m-0 font-display text-[24px] font-bold leading-[1.05] tracking-[-0.03em]">
          {event.title}
        </h3>
        <p className="m-0 truncate text-body-s text-on-ink-soft">
          {[event.venue, event.city].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-coral px-4 text-body-s font-bold text-ink"
            style={{ transform: `scale(${1 - press * 0.06})` }}
          >
            {free ? 'Réserver ma place' : 'Prendre mon billet'}
          </span>
          <span className="text-body font-bold text-white">
            {free ? 'Gratuit' : `Dès ${formatMoney(event.price)}`}
          </span>
        </div>
      </div>
    </div>
  );
};
