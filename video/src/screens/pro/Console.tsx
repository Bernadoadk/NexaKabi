import React from 'react';
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  Menu,
  ScanLine,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { config } from '../../config';
import { Avatar, BrandMark } from '../../components/ui/Basics';
import { Badge } from '../../components/ui/Badge';
import { StatusSpacer } from '../../components/motion/Frames';
import { heroEvent } from '../../lib/format';
import { cn } from '../../lib/layout';
import { BottomNav } from '../shared';

export type ConsoleLayout = 'desktop' | 'mobile';

const SECTIONS = [
  'Tableau de bord',
  'Événements',
  'Finances',
  'Équipe',
  'Paramètres',
  'Scanner',
] as const;

const MOBILE_TABS = [
  { label: 'Tableau', icon: LayoutDashboard },
  { label: 'Événements', icon: CalendarDays },
  { label: 'Scanner', icon: ScanLine },
  { label: 'Finances', icon: Wallet },
  { label: 'Équipe', icon: UsersRound },
] as const;

/**
 * Cadre de l'espace organisateur (`app/(pro)/pro/layout.tsx` et
 * `packages/ui/src/components/console-shell.tsx`) : en-tête, navigation de
 * section sur ordinateur, barre basse sur téléphone.
 */
export const ConsoleShell: React.FC<{
  layout: ConsoleLayout;
  section: (typeof SECTIONS)[number];
  scroll?: number;
  children: React.ReactNode;
}> = ({ layout, section, scroll = 0, children }) => {
  if (layout === 'mobile') {
    const tab = section === 'Tableau de bord' ? 'Tableau' : section;
    return (
      <div className="relative h-full overflow-hidden bg-paper">
        <div className="absolute inset-x-0 top-0 z-20">
          <StatusSpacer />
          <header className="flex h-[58px] items-center gap-3 border-b border-border bg-surface px-4">
            <div className="flex min-w-0 items-center gap-1 text-text-strong">
              <BrandMark size={34} />
              <span className="truncate font-display text-[16px] font-bold tracking-[-0.02em]">
                Espace organisateur
              </span>
            </div>
            <div className="flex-1" />
            <span className="relative flex size-[44px] items-center justify-center rounded-full text-text-2">
              <Bell className="size-[18px]" />
              <span className="absolute right-1.5 top-1.5 flex size-[7px] rounded-full bg-coral" />
            </span>
            <span className="flex size-[44px] items-center justify-center rounded-full text-text-strong">
              <Menu className="size-5" />
            </span>
          </header>
        </div>
        <div className="px-4 pt-[112px]" style={{ transform: `translateY(${-scroll}px)` }}>
          {children}
        </div>
        <BottomNav active={tab} tabs={MOBILE_TABS} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-paper">
      <header className="relative z-20 shrink-0 border-b border-border bg-surface">
        <div className="flex h-[58px] items-center gap-4 px-5">
          <div className="flex items-center gap-1 text-text-strong">
            <BrandMark size={34} />
            <span className="font-display text-[16px] font-bold tracking-[-0.02em]">
              Espace organisateur
            </span>
          </div>
          <div className="flex-1" />
          <span className="flex items-center gap-2 whitespace-nowrap text-body-s font-semibold text-text-strong">
            <Avatar name={config.data.organizer.name} size="compact" />
            {config.data.organizer.name}
          </span>
          <span className="flex size-[36px] items-center justify-center rounded-full border border-border-field text-text-strong">
            <UserRound className="size-4" />
          </span>
          <span className="relative flex size-[44px] items-center justify-center rounded-full text-text-2">
            <Bell className="size-[18px]" />
            <span className="absolute right-1.5 top-1.5 flex size-[7px] rounded-full bg-coral" />
          </span>
          <Avatar name={config.data.organizer.user} size="compact" />
        </div>
        <nav className="px-5">
          <ul className="m-0 flex list-none gap-1 p-0">
            {SECTIONS.map((entry) => (
              <li key={entry}>
                <span
                  className={cn(
                    'inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-body-s',
                    entry === section
                      ? 'border-coral font-bold text-text-strong'
                      : 'border-transparent font-semibold text-text-2',
                  )}
                >
                  {entry}
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <div className="px-5 pt-6" style={{ transform: `translateY(${-scroll}px)` }}>
          {children}
        </div>
      </main>
    </div>
  );
};

/** En-tête d'un événement et ses onglets (`pro/evenements/[id]/layout.tsx`). */
export const EventHeader: React.FC<{
  layout: ConsoleLayout;
  published: boolean;
  tab: 'Configuration' | 'Statistiques';
}> = ({ layout, published, tab }) => {
  const tabs = published
    ? ['Configuration', 'Aperçu', 'Participants', 'Contrôle', 'Statistiques']
    : ['Configuration', 'Aperçu'];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex min-h-[32px] items-center text-body-s font-semibold text-text-2">
          ← Mes événements
        </span>
        {layout === 'desktop' ? (
          <>
            <span className="text-text-3">/</span>
            <span className="text-body font-semibold">{heroEvent().title}</span>
          </>
        ) : null}
        <div className="flex-1" />
        <Badge tone={published ? 'ink' : 'neutral'}>{published ? 'Publié' : 'Brouillon'}</Badge>
        {published && layout === 'desktop' ? (
          <span className="text-body-s font-semibold text-coral">Page publique →</span>
        ) : null}
        {layout === 'mobile' ? (
          <span className="order-last w-full truncate text-body font-semibold">
            {heroEvent().title}
          </span>
        ) : null}
      </div>
      <nav className="-mx-4 border-b border-border px-4 sm:mx-0 sm:px-0">
        <ul className="m-0 flex list-none gap-1 overflow-hidden p-0">
          {tabs.map((entry) => (
            <li key={entry}>
              <span
                className={cn(
                  'inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-body-s',
                  entry === tab
                    ? 'border-coral font-bold text-text-strong'
                    : 'border-transparent font-semibold text-text-2',
                )}
              >
                {entry}
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

/** Champ de formulaire (`Field` + `Input` du design system), en lecture seule. */
export const FieldMock: React.FC<{
  label: string;
  hint?: string;
  value: React.ReactNode;
  suffix?: string;
  multiline?: boolean;
  className?: string;
}> = ({ label, hint, value, suffix, multiline = false, className }) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    <span className="text-body-s font-semibold">
      {label}
      {hint ? <span className="font-medium text-text-3"> {hint}</span> : null}
    </span>
    <div
      className={cn(
        'flex w-full items-stretch overflow-hidden rounded-field border border-border-field bg-surface text-[14px]',
        multiline ? 'min-h-[64px]' : 'min-h-[44px]',
      )}
    >
      <span
        className={cn('flex-1 px-[13px] py-[11px] leading-snug', multiline && 'text-text-strong')}
      >
        {value}
      </span>
      {suffix ? (
        <span className="flex items-center border-l border-border bg-paper px-3 text-body-s font-semibold text-text-2">
          {suffix}
        </span>
      ) : null}
    </div>
  </div>
);
