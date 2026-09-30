import React from 'react';
import { Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import { config } from '../config';
import { EventCardStandard } from '../components/ui/EventCard';
import { Button } from '../components/ui/Button';
import { StatusSpacer } from '../components/motion/Frames';
import { SPRINGS, sp } from '../lib/anim';
import { findEvent } from '../lib/format';
import { useTime } from '../lib/time';
import { BottomNav, PublicHeader } from './shared';

/**
 * Découverte, mobile (`app/(public)/evenements/page.tsx`, écran P2), avec le
 * filtre « Ce week-end » actif. Les cartes arrivent en cascade à partir de
 * `appear` (temps de la scène).
 */
export const DiscoverScreen: React.FC<{
  appear: number;
  scroll?: number;
  /** Mise en avant du badge « Bientôt complet » (0 → 1). */
  highlight?: number;
  /** Bouton « Carte » enfoncé (0 → 1). */
  mapPress?: number;
}> = ({ appear, scroll = 0, highlight = 0, mapPress = 0 }) => {
  const time = useTime();
  const results = config.data.discover.weekendIds.map(findEvent);

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

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ink" className="shrink-0">
              <SlidersHorizontal className="size-4" />
              Filtres
              <span className="flex size-5 items-center justify-center rounded-full bg-coral text-[11px] font-bold text-ink">
                1
              </span>
            </Button>
            <Button variant="secondary" className="shrink-0" press={mapPress}>
              <MapIcon className="size-4" />
              Carte
            </Button>
            <span className="ml-auto text-body-s text-text-2">{results.length} résultats</span>
          </div>

          <div className="flex gap-2">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink py-1.5 pl-3 pr-2 text-body-s font-semibold text-white">
              Ce week-end
              <X className="size-3.5" />
            </span>
            <span className="inline-flex shrink-0 items-center rounded-full px-2 text-body-s font-semibold text-text-2">
              Tout effacer
            </span>
          </div>
        </div>

        <div className="grid gap-4">
          {results.map((event, index) => {
            const enter = sp(time, appear + 4 + index * 5, SPRINGS.smooth);
            return (
              <EventCardStandard
                key={event.id}
                event={event}
                highlight={index === 0 ? highlight : 0}
                style={{
                  transform: `translateY(${(1 - enter) * 70}px)`,
                  opacity: Math.min(1, enter * 1.4),
                }}
              />
            );
          })}
        </div>
      </div>

      <BottomNav active="Découvrir" />
    </div>
  );
};
