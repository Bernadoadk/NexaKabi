import React from 'react';
import { Map as MapIcon, Search } from 'lucide-react';
import { config } from '../config';
import type { CategorySlug } from '../config.types';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { EventCardLarge, EventCardStandard } from '../components/ui/EventCard';
import { StatusSpacer } from '../components/motion/Frames';
import { findEvent, heroEvent } from '../lib/format';
import { cn } from '../lib/layout';
import { BottomNav, PublicHeader } from './shared';

/**
 * Accueil public, mobile (`app/(public)/page.tsx`, écran P1) :
 * bloc encre « Ce qui se passe près de toi, ce soir. », recherche,
 * raccourcis, puis la grande carte et la grille.
 */
export const HomeScreen: React.FC<{
  /** Raccourci touché, mis en surbrillance (0 → 1). */
  pressedChip?: number;
  scroll?: number;
}> = ({ pressedChip = 0, scroll = 0 }) => {
  const shortcuts: Array<{ label: string; slug?: CategorySlug }> = [
    { label: 'Week-end' },
    { label: 'Gratuit' },
    { label: config.categories.musique.name, slug: 'musique' },
    { label: config.categories.festivals.name, slug: 'festivals' },
    { label: config.categories.soirees.name, slug: 'soirees' },
  ];

  return (
    <div className="relative flex h-full flex-col bg-paper">
      <div className="relative z-20">
        <StatusSpacer />
        <PublicHeader />
      </div>

      <div className="relative z-0" style={{ transform: `translateY(${-scroll}px)` }}>
        <section className="flex flex-col gap-4 bg-ink px-4 pb-5 pt-5 text-white">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 font-display text-[26px] font-bold leading-[1.08] tracking-[-0.03em]">
              Ce qui se passe près de toi, <span className="text-coral-300">ce soir.</span>
            </h1>
            <p className="m-0 text-body text-on-ink-2">
              Découvre les événements près de chez toi, prends ton billet en Mobile Money et
              présente ton QR Code à l’entrée.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-text-3" />
              <div className="flex min-h-[48px] w-full items-center rounded-[13px] bg-white pl-10 pr-3.5 text-[15px] text-text-3">
                Concert, formation, artiste…
              </div>
            </div>
            <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[13px] bg-white/12 text-white">
              <MapIcon className="size-5" />
            </div>
          </div>

          <div className="-mx-4 flex gap-2 overflow-hidden px-4">
            <span className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-coral px-3.5 text-body-s font-bold text-ink">
              Ce soir
            </span>
            {shortcuts.map((chip, index) => (
              <span
                key={chip.label}
                className={cn(
                  'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-body-s font-semibold text-white',
                  index === 0 && pressedChip > 0
                    ? 'border-white/40 bg-white/25'
                    : 'border-white/15 bg-white/10',
                )}
                style={index === 0 ? { transform: `scale(${1 - pressedChip * 0.06})` } : undefined}
              >
                {chip.slug ? <CategoryIcon slug={chip.slug} className="size-3.5" /> : null}
                {chip.label}
              </span>
            ))}
          </div>
        </section>

        <main className="flex flex-col gap-4 px-4 pt-6">
          <EventCardLarge event={heroEvent()} />
          <EventCardStandard event={findEvent('reveillon')} />
          <EventCardStandard event={findEvent('gospel')} />
        </main>
      </div>

      <BottomNav active="Accueil" />
    </div>
  );
};
