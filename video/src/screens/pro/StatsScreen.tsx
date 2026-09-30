import React from 'react';
import { config } from '../../config';
import { Money } from '../../components/ui/Money';
import { Stat } from '../../components/ui/Stat';
import { ramp } from '../../lib/anim';
import { formatAmount, formatDateShort, heroEvent, parseDate } from '../../lib/format';
import { cn } from '../../lib/layout';
import { useTime } from '../../lib/time';
import { ConsoleShell, EventHeader, type ConsoleLayout } from './Console';

/**
 * Statistiques d'un événement (`pro/evenements/[id]/statistiques`, écran O9) :
 * trois chiffres, le détail par catégorie, puis les ventes par jour.
 * Les compteurs et les barres démarrent à `start` (temps de la scène).
 */
export const StatsScreen: React.FC<{ layout: ConsoleLayout; start: number; scroll?: number }> = ({
  layout,
  start,
  scroll = 0,
}) => {
  const time = useTime();
  const counters = ramp(time, start, start + 38);
  const bars = ramp(time, start + 14, start + 50);
  const days = ramp(time, start + 26, start + 62);

  const tickets = config.data.tickets;
  const sold = tickets.reduce((total, ticket) => total + ticket.sold, 0);
  const { netAmount, attendanceRate, checkedIn, salesByDay } = config.data.stats;
  const peak = Math.max(...salesByDay.map((day) => day.tickets));

  return (
    <ConsoleShell layout={layout} section="Événements" scroll={scroll}>
      <div className="flex flex-col gap-4">
        <EventHeader layout={layout} published tab="Statistiques" />

        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            <h1 className="m-0 font-display text-h1 font-bold tracking-[-0.02em]">Statistiques</h1>
            <p className="m-0 text-body-s text-text-2">{heroEvent().title}</p>
          </header>

          <div className={cn('grid gap-4', layout === 'desktop' ? 'grid-cols-3' : 'grid-cols-1')}>
            <Stat label="Billets vendus" value={Math.round(sold * counters)} />
            <Stat label="Recette nette" amount={Math.round(netAmount * counters)} />
            <Stat
              label="Taux de présence"
              value={`${Math.round(attendanceRate * counters)} %`}
              hint={`${formatAmount(Math.round(checkedIn * counters))} entrées sur ${sold}`}
            />
          </div>

          <div className="overflow-hidden rounded-panel border border-border bg-surface">
            <div className="border-b border-border-subtle px-5 py-3">
              <h2 className="m-0 text-body font-bold">Par catégorie</h2>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {tickets.map((ticket) => {
                const ratio = Math.round((ticket.sold / ticket.total) * 100);
                return (
                  <li
                    key={ticket.name}
                    className="flex flex-col gap-2 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-body font-semibold">{ticket.name}</span>
                      <Money amount={Math.round(ticket.sold * ticket.price * bars)} size="small" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill-neutral">
                        <div
                          className="h-full rounded-full bg-coral"
                          style={{ width: `${ratio * bars}%` }}
                        />
                      </div>
                      <span className="tabular shrink-0 text-micro text-text-3">
                        {Math.round(ticket.sold * bars)} / {ticket.total}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="overflow-hidden rounded-panel border border-border bg-surface">
            <div className="border-b border-border-subtle px-5 py-3">
              <h2 className="m-0 text-body font-bold">Ventes par jour</h2>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {salesByDay.map((day, index) => {
                const grow = Math.min(1, Math.max(0, days * 1.6 - index * 0.15));
                return (
                  <li
                    key={day.date}
                    className="flex items-center gap-3 border-b border-border-subtle px-5 py-2.5 last:border-b-0"
                  >
                    <span className="w-20 shrink-0 text-micro text-text-3">
                      {formatDateShort(parseDate(day.date))}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-fill-neutral">
                      <div
                        className="h-full rounded-full bg-ink"
                        style={{ width: `${Math.round((day.tickets / peak) * 100) * grow}%` }}
                      />
                    </div>
                    <span className="tabular w-10 shrink-0 text-right text-body-s font-semibold">
                      {Math.round(day.tickets * grow)}
                    </span>
                    {layout === 'desktop' ? (
                      <span className="w-28 shrink-0 text-right">
                        <Money amount={Math.round(day.amount * grow)} size="small" />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
};
