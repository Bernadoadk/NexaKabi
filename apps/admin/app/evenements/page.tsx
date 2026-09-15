import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import type { PendingEvent } from '@nexakabi/contracts';
import { formatEventCaptionWithTime, formatMoney } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser } from '@/lib/session';
import { AdminShell } from '../shell';
import { EventDecision } from './event-decision';

export const metadata: Metadata = { title: 'Événements à publier' };

/**
 * Écran M2 — revue des événements.
 *
 * ── Pourquoi tout tient sur un seul écran ────────────────────────────────
 * La décision se prend en deux minutes : le titre est-il crédible, la date
 * tient-elle debout, les prix sont-ils cohérents, l'organisation est-elle
 * connue ? Ouvrir une fiche par événement transformerait une lecture rapide en
 * corvée, et une corvée finit expédiée.
 *
 * ── L'ordre : le plus proche d'abord ────────────────────────────────────
 * Un événement dans trois jours perd des ventes à chaque heure d'attente ; un
 * autre dans six mois peut attendre demain.
 */
export default async function PendingEventsPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');

  const result = await adminFetch<PendingEvent[]>('/events');

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">
            Événements à publier
          </h1>
          <p className="text-body-s text-text-2">
            Le premier événement d’une organisation passe par ici. Les suivants sont publiés
            directement une fois l’organisation vérifiée.
          </p>
        </header>

        {!result.ok ? (
          <Alert tone="danger" title="Liste indisponible">
            {result.message}
          </Alert>
        ) : result.data.length === 0 ? (
          <EmptyState
            icon={<CircleCheck size={26} />}
            title="Aucun événement en attente"
            description="Les premiers événements soumis par les organisateurs apparaîtront ici."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {result.data.map((event) => (
              <li key={event.id}>
                <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-h3 font-bold">{event.title}</h2>
                        {event.isFirstEvent ? (
                          <Badge tone="warning">Premier événement</Badge>
                        ) : null}
                        {event.organizationVerified ? (
                          <Badge tone="ink">Organisation vérifiée</Badge>
                        ) : (
                          <Badge tone="neutral">Non vérifiée</Badge>
                        )}
                      </div>

                      <p className="text-body-s text-text-2">
                        {event.organizationName} ·{' '}
                        {formatEventCaptionWithTime(new Date(event.startsAt))}
                        {event.venueName || event.cityName
                          ? ` · ${[event.venueName, event.cityName].filter(Boolean).join(', ')}`
                          : ''}
                      </p>

                      <p className="text-micro text-text-3">
                        {event.ticketTypeCount} catégorie
                        {event.ticketTypeCount > 1 ? 's' : ''} de billets
                        {event.lowestPrice !== null
                          ? ` · à partir de ${formatMoney(event.lowestPrice)}`
                          : ' · aucun prix défini'}
                      </p>
                    </div>

                    <a
                      href={`http://localhost:3000/e/${event.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-body-s font-semibold"
                    >
                      Voir la page →
                    </a>
                  </div>

                  {event.ticketTypeCount === 0 ? (
                    <Alert tone="warning" title="Aucune catégorie de billet">
                      Publier cet événement donnerait une page où l’on ne peut rien acheter.
                    </Alert>
                  ) : null}

                  <EventDecision eventId={event.id} />
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
