import type { Metadata } from 'next';
import Link from 'next/link';
import { Calendar, MapPin, ScanLine, Ticket, UserRound } from 'lucide-react';
import type { AssignedEvent, TicketGroup } from '@nexakabi/contracts';
import { formatEventCaptionWithTime, formatRelative } from '@nexakabi/utils';
import { Badge, Button, EmptyState, Surface } from '@nexakabi/ui';
import { apiFetchAuthenticated, getCurrentUser } from '@/lib/session';
import { fetchMyTickets } from '@/lib/tickets';
import { LogoutButton } from './logout-button';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Mon compte' };

/**
 * Écran U1 — tableau de bord participant.
 *
 * Une seule chose compte ici : le PROCHAIN événement, et l'accès à son QR en un
 * tap. Le prototype le met en carte large parce que c'est la raison pour
 * laquelle quelqu'un ouvre cette page — pas pour consulter ses préférences de
 * notification.
 */
export default async function AccountPage() {
  const user = await getCurrentUser();
  const [upcoming, assigned] = await Promise.all([
    fetchMyTickets('upcoming'),
    // Les événements que cette personne peut contrôler. Un bénévole invité
    // pour la soirée se connecte avec son numéro comme n'importe quel
    // participant : c'est ICI qu'il doit trouver le scanner, sans avoir à
    // connaître une adresse.
    apiFetchAuthenticated<AssignedEvent[]>('/checkin/events'),
  ]);
  const next = upcoming[0] ?? null;
  const scannable = assigned.ok ? assigned.data : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="eyebrow text-text-3">Espace participant</p>
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">
          Bonjour {user?.fullName.split(' ')[0] ?? ''}
        </h1>
      </header>

      {scannable.length > 0 ? <ScannerCard events={scannable} /> : null}

      {next ? <NextEventCard group={next} /> : <NoUpcomingState />}

      {upcoming.length > 1 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-h3 font-bold">Autres événements à venir</h2>
            <Link href="/mon-compte/billets" className="text-body-s font-semibold text-text-2">
              Tout voir
            </Link>
          </div>

          <ul className="flex flex-col gap-2">
            {upcoming.slice(1, 4).map((group) => (
              <li key={group.eventId}>
                <Surface variant="panel" padding="none">
                  <Link
                    href={
                      group.tickets[0]
                        ? `/mon-compte/billets/${group.tickets[0].id}`
                        : '/mon-compte/billets'
                    }
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-surface-alt"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-body font-semibold">{group.eventTitle}</span>
                      <span className="text-micro text-text-3">
                        {formatEventCaptionWithTime(new Date(group.eventStartsAt))}
                      </span>
                    </div>
                    <Badge tone="neutral">
                      {group.tickets.length} billet{group.tickets.length > 1 ? 's' : ''}
                    </Badge>
                  </Link>
                </Surface>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-h3 font-bold">
          <UserRound className="size-[18px] text-text-3" />
          Mon compte
        </h2>

        {user ? <ProfileForm user={user} /> : null}

        <div className="border-t border-border-subtle pt-4">
          <LogoutButton />
        </div>
      </Surface>
    </div>
  );
}

/**
 * Prochain événement, en carte large.
 *
 * Le bouton mène directement au QR du premier billet, pas à une liste : à
 * l'entrée d'un concert, chaque écran intermédiaire est un écran de trop.
 */
function NextEventCard({ group }: { group: TicketGroup }) {
  const startsAt = new Date(group.eventStartsAt);
  // Un groupe est construit à partir d'au moins un billet ; le repli existe
  // pour que le typage reste honnête, pas parce que le cas est attendu.
  const first = group.tickets[0];

  return (
    <section aria-labelledby="prochain-evenement">
      <div className="overflow-hidden rounded-block bg-ink text-white">
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <Badge tone="accent">{formatRelative(startsAt)}</Badge>
            <span className="text-micro text-white/60">
              {group.tickets.length} billet{group.tickets.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <h2
              id="prochain-evenement"
              className="font-display text-h2 font-bold leading-tight tracking-[-0.02em]"
            >
              {group.eventTitle}
            </h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-s text-white/70">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {formatEventCaptionWithTime(startsAt)}
              </span>
              {group.eventVenueName || group.eventCityName ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {[group.eventVenueName, group.eventCityName].filter(Boolean).join(', ')}
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button asChild variant="primary" size="primary" block>
              <Link
                href={first ? `/mon-compte/billets/${first.id}` : '/mon-compte/billets'}
                className="text-center"
              >
                Voir mon QR
              </Link>
            </Button>
            <Button asChild variant="secondary" size="primary" block>
              <Link href={`/e/${group.eventSlug}`} className="text-center">
                Détails de l’événement
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function NoUpcomingState() {
  return (
    <EmptyState
      icon={<Ticket size={26} />}
      title="Aucun événement à venir"
      description="Dès ton premier achat, ton prochain événement s’affichera ici avec son QR à portée de tap."
      action={
        <Button asChild variant="primary" size="primary">
          <Link href="/evenements">Découvrir les événements</Link>
        </Button>
      }
    />
  );
}

/**
 * Accès au scanner, pour un membre d'équipe.
 *
 * Placé AVANT le prochain événement : le soir où quelqu'un contrôle une porte,
 * c'est la seule chose qu'il vient chercher ici. Le reste de la page ne change
 * pas — la personne reste aussi participante, avec ses propres billets.
 */
function ScannerCard({ events }: { events: AssignedEvent[] }) {
  const open = events.filter((event) => event.isOpen);
  const first = open[0] ?? events[0]!;

  return (
    <section aria-labelledby="scanner" className="rounded-panel bg-ink p-5 text-white">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p id="scanner" className="eyebrow text-on-ink-3">
            Contrôle à l’entrée
          </p>
          <p className="font-display text-h3 font-bold">
            {events.length === 1
              ? `Tu contrôles l’entrée de « ${first.title} »`
              : `Tu contrôles l’entrée de ${events.length} événements`}
          </p>
          <p className="text-body-s text-on-ink-2">
            {open.length > 0
              ? 'Le scanner est ouvert. Il fonctionne sans réseau une fois le carnet chargé.'
              : 'Le scanner s’ouvre une heure avant le début de l’événement.'}
          </p>
        </div>

        <Link
          href={events.length === 1 ? `/scan/${first.eventId}` : '/scan'}
          className="inline-flex min-h-[var(--tap-primary)] shrink-0 items-center justify-center gap-2 rounded-button bg-coral px-6 font-bold text-ink transition hover:bg-coral-hover"
        >
          <ScanLine className="size-[18px]" aria-hidden />
          Ouvrir le scanner
        </Link>
      </div>
    </section>
  );
}
