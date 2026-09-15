import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import type { CheckInStats } from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Badge, Button, EmptyState, Stat, Surface } from '@nexakabi/ui';
import { apiFetchAuthenticated } from '@/lib/session';

export const metadata: Metadata = { title: 'Participants' };

interface AttendeeRow {
  id: string;
  reference: string;
  attendeeName: string;
  attendeePhone: string | null;
  ticketTypeName: string;
  status: string;
  usedAt: string | null;
  orderReference: string;
}

/**
 * Écran O6 — participants.
 *
 * ── Ce que l'organisateur vient y faire ─────────────────────────────────────
 * Deux choses, et deux seulement : chercher quelqu'un dont il n'est pas sûr
 * qu'il a payé, et emporter la liste. Le reste — statistiques, courbes — a son
 * propre écran.
 *
 * L'export est donc un bouton de premier plan, pas une option cachée : dans la
 * réalité béninoise, la liste finit souvent imprimée et cochée à la main en
 * secours du scanner.
 */
export default async function AttendeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [attendeesResult, statsResult] = await Promise.all([
    apiFetchAuthenticated<AttendeeRow[]>(
      `/organizer/finance/events/${encodeURIComponent(id)}/attendees`,
    ),
    apiFetchAuthenticated<CheckInStats>(`/checkin/events/${encodeURIComponent(id)}/stats`),
  ]);

  if (!attendeesResult.ok) {
    return (
      <Alert tone="danger" title="Participants indisponibles">
        {attendeesResult.error.message}
      </Alert>
    );
  }

  const attendees = attendeesResult.data;
  const stats = statsResult.ok ? statsResult.data : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Participants</h1>
        </div>

        {attendees.length > 0 ? (
          <Button asChild variant="secondary" size="default">
            {/* Un lien direct, pas un appel JavaScript : le téléchargement
                fonctionne même si le script de la page n'a pas chargé. */}
            <a href={`/api/pro/events/${id}/attendees.csv`} download>
              Exporter en CSV
            </a>
          </Button>
        ) : null}
      </header>

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Billets émis" value={String(stats.expectedCount)} />
          <Stat label="Entrées enregistrées" value={String(stats.checkedInCount)} />
          <Stat
            label="Taux de présence"
            value={
              stats.checkedInCount === 0
                ? '—'
                : `${Math.round((stats.checkedInCount / Math.max(1, stats.expectedCount)) * 100)} %`
            }
          />
        </div>
      ) : null}

      {attendees.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title="Aucun participant pour l’instant"
          description="La liste se remplira à mesure des ventes. Elle reste exportable à tout moment."
        />
      ) : (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          {/* Le tableau défile horizontalement dans son propre conteneur : sur
              un téléphone, c'est la seule façon de garder toutes les colonnes
              sans casser la mise en page de la page. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-2">
                  <Th>Nom</Th>
                  <Th>Référence</Th>
                  <Th>Catégorie</Th>
                  <Th>Entrée</Th>
                </tr>
              </thead>
              <tbody>
                {attendees.map((attendee) => (
                  <tr key={attendee.id} className="border-b border-border-subtle last:border-b-0">
                    <Td>
                      <span className="font-semibold">{attendee.attendeeName}</span>
                      {attendee.attendeePhone ? (
                        <span className="block text-micro text-text-3">
                          {attendee.attendeePhone}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="tabular text-body-s">{attendee.reference}</span>
                    </Td>
                    <Td>
                      <span className="text-body-s">{attendee.ticketTypeName}</span>
                    </Td>
                    <Td>
                      {attendee.status === 'USED' ? (
                        <span className="flex flex-col gap-0.5">
                          <Badge tone="success">Entré</Badge>
                          {attendee.usedAt ? (
                            <span className="text-micro text-text-3">
                              {formatEventCaptionWithTime(new Date(attendee.usedAt))}
                            </span>
                          ) : null}
                        </span>
                      ) : attendee.status === 'VALID' ? (
                        <Badge tone="neutral">Non entré</Badge>
                      ) : (
                        <Badge tone="danger">Annulé</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-left text-micro font-bold uppercase tracking-wide text-text-3">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-5 py-3 align-top">{children}</td>;
}
