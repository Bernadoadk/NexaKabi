import type { Metadata } from 'next';
import type { EventStats } from '@nexakabi/contracts';
import { formatDateShort } from '@nexakabi/utils';
import { Alert, EmptyState, Money, SimpleBarChart, Stat, Surface } from '@nexakabi/ui';
import { apiFetchAuthenticated } from '@/lib/session';

export const metadata: Metadata = { title: 'Statistiques' };

/**
 * Écran O9 — statistiques d'un événement.
 *
 * ── Trois chiffres, pas trente ──────────────────────────────────────────────
 * Combien vendu, combien encaissé, combien entré. Le prototype prévient : un
 * organisateur regarde ces chiffres entre deux appels, sur son téléphone, la
 * veille de son événement. Un tableau de bord qui demande à être exploré ne
 * sera pas exploré.
 *
 * Le détail par catégorie et la courbe des ventes viennent après — pour ceux
 * qui en veulent, jamais devant.
 */
export default async function EventStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await apiFetchAuthenticated<EventStats>(
    `/organizer/finance/events/${encodeURIComponent(id)}/stats`,
  );

  if (!result.ok) {
    return (
      <Alert tone="danger" title="Statistiques indisponibles">
        {result.error.message}
      </Alert>
    );
  }

  const stats = result.data;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Statistiques</h1>
        <p className="text-body-s text-text-2">{stats.eventTitle}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Billets vendus" value={String(stats.ticketsSold)} />
        <Stat label="Recette nette" amount={stats.netAmount} />
        <Stat
          label="Taux de présence"
          /* `null` avant les premières entrées : afficher « 0 % » la veille
             serait exact et parfaitement décourageant. */
          value={stats.attendanceRate === null ? '—' : `${stats.attendanceRate} %`}
          hint={
            stats.attendanceRate === null
              ? 'Disponible après les premières entrées'
              : `${stats.checkedInCount} entrées sur ${stats.ticketsSold}`
          }
        />
      </div>

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-body font-bold">Par catégorie</h2>
        </div>
        <ul className="flex flex-col">
          {stats.byTicketType.map((type) => {
            const ratio = type.total === 0 ? 0 : Math.round((type.sold / type.total) * 100);

            return (
              <li
                key={type.ticketTypeId}
                className="flex flex-col gap-2 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body font-semibold">{type.name}</span>
                  <Money amount={type.grossAmount} size="small" />
                </div>

                <div className="flex items-center gap-3">
                  {/* Une barre plutôt qu'un pourcentage seul : le remplissage se
                      lit sans lire. */}
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill-neutral"
                    role="img"
                    aria-label={`${type.sold} sur ${type.total} vendus`}
                  >
                    <div className="h-full rounded-full bg-coral" style={{ width: `${ratio}%` }} />
                  </div>
                  <span className="tabular shrink-0 text-micro text-text-3">
                    {type.sold} / {type.total}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Surface>

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-body font-bold">Ventes par jour</h2>
        </div>

        {stats.salesByDay.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState
              title="Aucune vente pour l’instant"
              description="La courbe apparaîtra dès le premier billet vendu."
            />
          </div>
        ) : (
          <SimpleBarChart
            points={stats.salesByDay.map((point) => ({
              label: formatDateShort(new Date(point.date)),
              value: point.ticketCount,
              valueLabel: `${point.ticketCount} billet${point.ticketCount > 1 ? 's' : ''}`,
              secondaryValue: <Money amount={point.grossAmount} size="small" />,
            }))}
          />
        )}
      </Surface>

      <p className="text-center text-micro text-text-3">
        La recette nette est lue au grand livre : elle correspond exactement à ce qui figure sur ta
        page Finances.
      </p>
    </div>
  );
}
