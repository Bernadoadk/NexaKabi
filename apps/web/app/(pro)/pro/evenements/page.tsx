import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarPlus } from 'lucide-react';
import type { EventStatus, EventSummary, OrganizationStats } from '@nexakabi/contracts';
import { EmptyState, Stat, Surface, cn } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { orgFetch, resolveActiveOrganization } from '@/lib/organizations';
import { CreateEventButton } from './create-event-form';
import { OrganizerEventCard } from './organizer-event-card';

export const metadata: Metadata = { title: 'Mes événements' };

type Filter = 'tous' | 'brouillons' | 'en-ligne' | 'passes';

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: 'tous', label: 'Tous' },
  { key: 'brouillons', label: 'Brouillons' },
  { key: 'en-ligne', label: 'En ligne' },
  { key: 'passes', label: 'Passés & annulés' },
];

const DRAFT_STATUSES: readonly EventStatus[] = ['DRAFT', 'REJECTED', 'PENDING_REVIEW'];
const LIVE_STATUSES: readonly EventStatus[] = ['PUBLISHED', 'SOLD_OUT', 'POSTPONED'];

function matches(event: EventSummary, filter: Filter, now: number): boolean {
  const ended = new Date(event.endsAt).getTime() < now;
  const over =
    event.status === 'CANCELLED' || event.status === 'COMPLETED' || event.status === 'ARCHIVED';

  switch (filter) {
    case 'brouillons':
      return DRAFT_STATUSES.includes(event.status);
    case 'en-ligne':
      return LIVE_STATUSES.includes(event.status) && !ended;
    case 'passes':
      return over || (LIVE_STATUSES.includes(event.status) && ended);
    default:
      return true;
  }
}

/**
 * Liste des événements de l'organisation (écran O2).
 *
 * ── Ce que cet écran est devenu ─────────────────────────────────────────────
 * Une grille de cartes — visuel, date, heure, lieu, prix — comme dans la
 * découverte, parce qu'un organisateur reconnaît son événement à son affiche
 * avant son titre. Chaque carte ouvre l'aperçu de la page publique et porte
 * ses actions : reprendre ou modifier, publier ou dépublier, supprimer. Les
 * totaux restent en tête : cette liste doit dire ce que les événements ont
 * rapporté sans qu'on ouvre chacun.
 *
 * Le filtre vit dans l'URL (`?etat=`) : revenir de l'assistant retrouve la
 * même vue, et un lien vers « mes brouillons » se partage dans l'équipe.
 */
export default async function OrganizerEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?suite=/pro/evenements');

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const [{ etat }, result, statsResult] = await Promise.all([
    searchParams,
    orgFetch<EventSummary[]>(active.id, '/organizer/events'),
    orgFetch<OrganizationStats>(active.id, '/organizer/finance/organization/stats'),
  ]);

  const filter: Filter = FILTERS.some((entry) => entry.key === etat) ? (etat as Filter) : 'tous';
  const events = result.ok ? result.data : [];
  const stats = statsResult.ok ? statsResult.data : null;
  const now = Date.now();

  const counts = Object.fromEntries(
    FILTERS.map((entry) => [entry.key, events.filter((event) => matches(event, entry.key, now)).length]),
  ) as Record<Filter, number>;

  // Les brouillons d'abord — c'est là qu'il y a du travail —, puis par date.
  const shown = events
    .filter((event) => matches(event, filter, now))
    .sort((a, b) => {
      const aDraft = DRAFT_STATUSES.includes(a.status) ? 0 : 1;
      const bDraft = DRAFT_STATUSES.includes(b.status) ? 0 : 1;
      if (aDraft !== bDraft && filter === 'tous') return aDraft - bDraft;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-h1 font-bold">Mes événements</h1>
          <p className="text-body-s text-text-2">
            {events.length === 0
              ? 'Aucun événement pour l’instant.'
              : `${events.length} événement${events.length > 1 ? 's' : ''} · ${counts['en-ligne']} en ligne · ${counts.brouillons} en préparation`}
          </p>
        </div>
        {events.length > 0 ? <CreateEventButton organizationId={active.id} /> : null}
      </div>

      {stats && stats.eventsCount > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
          <Stat label="Publiés" value={String(stats.publishedEventsCount)} className="p-3.5 sm:p-[18px]" />
          <Stat
            label={
              <>
                <span className="sm:hidden">Vendus</span>
                <span className="hidden sm:inline">Billets vendus</span>
              </>
            }
            value={String(stats.ticketsSoldTotal)}
            className="p-3.5 sm:p-[18px]"
          />
          <Stat label="Entrées" value={String(stats.checkedInTotal)} className="p-3.5 sm:p-[18px]" />
        </div>
      ) : null}

      {events.length > 0 ? (
        <nav
          aria-label="Filtrer les événements"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {FILTERS.map((entry) => {
            const active = entry.key === filter;
            return (
              <Link
                key={entry.key}
                href={entry.key === 'tous' ? '/pro/evenements' : `/pro/evenements?etat=${entry.key}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-body-s font-semibold transition-colors',
                  active
                    ? 'bg-ink text-white'
                    : 'border border-border-field bg-surface text-text-2 hover:bg-paper hover:text-text-strong',
                )}
              >
                {entry.label}
                <span className={cn('tabular text-micro', active ? 'text-white/70' : 'text-text-3')}>
                  {counts[entry.key]}
                </span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {events.length === 0 ? (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <EmptyState
            icon={<CalendarPlus size={26} />}
            title="Aucun événement pour l’instant"
            description="Crée ton premier événement — il faut cinq minutes, et tu pourras le publier plus tard. Chaque étape s’enregistre : tu peux fermer l’onglet et revenir."
          />
          <div className="flex justify-center border-t border-border-subtle px-6 py-5">
            <CreateEventButton
              organizationId={active.id}
              size="mobile"
              label="Créer mon premier événement"
            />
          </div>
        </Surface>
      ) : shown.length === 0 ? (
        <Surface variant="panel" padding="comfortable" className="text-center">
          <p className="text-body font-semibold text-text-strong">Rien dans cette vue</p>
          <p className="mt-1 text-body-s text-text-2">
            <Link href="/pro/evenements" className="font-semibold">
              Voir tous les événements
            </Link>
          </p>
        </Surface>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((event) => (
            <li key={event.id}>
              <OrganizerEventCard event={event} organizationId={active.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
