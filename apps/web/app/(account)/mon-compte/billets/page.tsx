import type { Metadata } from 'next';
import Link from 'next/link';
import { Ban, CircleCheck, Ticket as TicketIcon } from 'lucide-react';
import {
  TICKET_TABS,
  TICKET_TAB_LABELS,
  ticketTabSchema,
  type TicketGroup,
  type TicketTab,
} from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Badge, Button, EmptyState, Surface, cn } from '@nexakabi/ui';
import { fetchMyTickets } from '@/lib/tickets';

export const metadata: Metadata = { title: 'Mes billets' };

/**
 * Écran U2 — Mes billets.
 *
 * Une carte par ÉVÉNEMENT, pas par billet : quelqu'un qui a pris quatre places
 * pour le même concert n'a pas quatre choses à gérer, il en a une.
 *
 * Les onglets sont des liens, pas un état client : chaque onglet a son URL,
 * donc son entrée d'historique et son partage possible. Le retour arrière du
 * navigateur fait ce qu'on attend de lui.
 */
export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { onglet } = await searchParams;
  const parsed = ticketTabSchema.safeParse(onglet);
  const tab: TicketTab = parsed.success ? parsed.data : 'upcoming';

  const groups = await fetchMyTickets(tab);
  const ticketCount = groups.reduce((total, group) => total + group.tickets.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Mes billets</h1>
        <p className="text-body-s text-text-2">
          {ticketCount === 0
            ? 'Aucun billet dans cet onglet.'
            : `${ticketCount} billet${ticketCount > 1 ? 's' : ''} · ${groups.length} événement${groups.length > 1 ? 's' : ''}`}
        </p>
      </header>

      <TabBar current={tab} />

      {/* Le bandeau du prototype : dire que les billets fonctionnent sans
          réseau évite le réflexe de panique devant une barre de signal vide. */}
      {tab === 'upcoming' && ticketCount > 0 ? (
        <Alert tone="info" title="Prêts hors ligne">
          Ouvre chaque billet une fois avant de partir : son QR restera affichable même sans
          connexion à l’entrée.
        </Alert>
      ) : null}

      {groups.length === 0 ? <TabEmptyState tab={tab} /> : <GroupList groups={groups} />}
    </div>
  );
}

function TabBar({ current }: { current: TicketTab }) {
  return (
    <nav aria-label="Filtrer les billets">
      <ul className="flex gap-2 overflow-x-auto">
        {TICKET_TABS.map((tab) => {
          const active = tab === current;

          return (
            <li key={tab}>
              <Link
                href={
                  tab === 'upcoming' ? '/mon-compte/billets' : `/mon-compte/billets?onglet=${tab}`
                }
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-9 items-center whitespace-nowrap rounded-chip px-3.5 text-body-s transition',
                  active
                    ? 'bg-ink font-bold text-white'
                    : 'bg-surface font-semibold text-text-2 hover:text-text-strong',
                )}
              >
                {TICKET_TAB_LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TabEmptyState({ tab }: { tab: TicketTab }) {
  if (tab === 'upcoming') {
    return (
      <EmptyState
        icon={<TicketIcon size={26} />}
        title="Aucun billet à venir"
        description="Tes prochains événements apparaîtront ici dès ton premier achat."
        action={
          <Button asChild variant="primary" size="primary">
            <Link href="/evenements">Découvrir les événements</Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={tab === 'used' ? <CircleCheck size={26} /> : <Ban size={26} />}
      title={tab === 'used' ? 'Aucun billet utilisé' : 'Aucun billet annulé'}
      description={
        tab === 'used'
          ? 'Les billets des événements passés se rangent ici.'
          : 'Les billets annulés ou remboursés se rangent ici.'
      }
    />
  );
}

function GroupList({ groups }: { groups: TicketGroup[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {groups.map((group) => (
        <li key={group.eventId}>
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <div className="flex flex-col gap-1 border-b border-border-subtle px-5 py-4">
              <p className="eyebrow text-text-3">
                {formatEventCaptionWithTime(new Date(group.eventStartsAt))}
              </p>
              <h2 className="text-h3 font-bold">
                <Link href={`/e/${group.eventSlug}`} className="hover:underline">
                  {group.eventTitle}
                </Link>
              </h2>
              {group.eventVenueName || group.eventCityName ? (
                <p className="text-body-s text-text-2">
                  {[group.eventVenueName, group.eventCityName].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>

            <ul className="flex flex-col">
              {group.tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body font-semibold">{ticket.attendeeName}</span>
                    <span className="flex items-center gap-2 text-micro text-text-3">
                      <span className="tabular">{ticket.reference}</span>
                      <span>·</span>
                      <span className="truncate">{ticket.ticketTypeName}</span>
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {ticket.status === 'USED' ? <Badge tone="neutral">Utilisé</Badge> : null}
                    {ticket.status === 'CANCELLED' || ticket.status === 'REFUNDED' ? (
                      <Badge tone="danger">Annulé</Badge>
                    ) : null}
                    <Button asChild variant="secondary" size="compact">
                      <Link href={`/mon-compte/billets/${ticket.id}`}>Voir le QR</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Surface>
        </li>
      ))}
    </ul>
  );
}
