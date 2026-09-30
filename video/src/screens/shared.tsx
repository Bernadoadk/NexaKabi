import React from 'react';
import { Bell, ChevronDown, Compass, Home, MapPin, Ticket, UserRound } from 'lucide-react';
import { config } from '../config';
import { Avatar, BrandMark, Wordmark } from '../components/ui/Basics';
import { cn } from '../lib/layout';

/** En-tête public mobile (`app/(public)/layout.tsx`, sous le palier md). */
export const PublicHeader: React.FC = () => (
  <header className="flex h-[58px] shrink-0 items-center gap-2.5 border-b border-border-subtle bg-surface px-4">
    <div className="flex shrink-0 items-center gap-1 text-text">
      <BrandMark size={34} />
      <Wordmark className="text-[18px]" />
    </div>
    <div className="flex-1" />
    <div className="flex h-[34px] items-center gap-1.5 rounded-full bg-paper px-2.5 text-body-s font-semibold text-text-strong">
      <MapPin className="size-4 text-coral" />
      {config.data.city}
      <ChevronDown className="size-3.5 text-text-3" />
    </div>
    <div className="flex size-[44px] shrink-0 items-center justify-center">
      <Avatar name={config.data.buyer.name} size="compact" />
    </div>
  </header>
);

const PUBLIC_TABS = [
  { label: 'Accueil', icon: Home },
  { label: 'Découvrir', icon: Compass },
  { label: 'Billets', icon: Ticket },
  { label: 'Alertes', icon: Bell },
  { label: 'Profil', icon: UserRound },
] as const;

/** Barre d'onglets mobile (`packages/ui/src/components/bottom-tab-bar.tsx`). */
export const BottomNav: React.FC<{
  active: string;
  tabs?: ReadonlyArray<{
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }>;
}> = ({ active, tabs = PUBLIC_TABS }) => (
  <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[16px]">
    <ul className="m-0 flex list-none items-stretch justify-around px-2 pb-2 pt-[9px]">
      {tabs.map(({ label, icon: Icon }) => {
        const on = label === active;
        return (
          <li key={label} className="min-w-[56px] flex-1">
            <div
              className={cn(
                'relative flex min-h-[44px] flex-col items-center justify-center gap-[3px] rounded-[10px] px-1',
                on ? 'text-coral' : 'text-text-3',
              )}
            >
              <span className="relative flex size-[22px] items-center justify-center">
                <Icon className="size-[19px]" strokeWidth={on ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  'text-[10px] leading-none tracking-[0.01em]',
                  on ? 'font-bold' : 'font-semibold',
                )}
              >
                {label}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  </nav>
);
