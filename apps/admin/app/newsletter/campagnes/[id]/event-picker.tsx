'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import { NEWSLETTER_MAX_EVENTS, type NewsletterEvent } from '@nexakabi/contracts';
import { formatEventCaptionWithTime, formatMoney } from '@nexakabi/utils';
import { Button, Input } from '@nexakabi/ui';

/**
 * Les événements mis en avant : une recherche parmi ceux à venir, une liste
 * ordonnée de ceux retenus.
 *
 * L'ordre est celui de l'e-mail : le premier est celui qu'on lit, les suivants
 * ceux qu'on parcourt. D'où les flèches plutôt qu'un tri automatique par date.
 */
export function EventPicker({
  value,
  onChange,
  disabled,
}: {
  value: NewsletterEvent[];
  onChange: (next: NewsletterEvent[]) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<NewsletterEvent[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    // Une requête par pause de frappe, pas par lettre.
    const timer = setTimeout(() => {
      setLoading(true);
      const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';

      fetch(`/api/admin/newsletter/events${query}`)
        .then((response) => (response.ok ? (response.json() as Promise<NewsletterEvent[]>) : []))
        .then((events) => setResults(events))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const selectedIds = new Set(value.map((event) => event.id));
  const full = value.length >= NEWSLETTER_MAX_EVENTS;

  function move(index: number, delta: number) {
    const next = [...value];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {value.map((event, index) => (
            <li
              key={event.id}
              className="flex items-center gap-2 rounded-card border border-border bg-surface p-3"
            >
              <span className="w-5 text-center text-micro font-bold text-text-3">{index + 1}</span>
              <EventLine event={event} />
              <div className="flex shrink-0 gap-1">
                <IconButton
                  label="Monter"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton
                  label="Descendre"
                  disabled={disabled || index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton
                  label={`Retirer ${event.title}`}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((entry) => entry.id !== event.id))}
                >
                  <X className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-card bg-paper p-3 text-body-s text-text-2">
          Aucun événement mis en avant. Une campagne peut s’en passer — un texte seul suffit.
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-card border border-border-subtle p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Chercher un événement à venir, ou un organisateur…"
            aria-label="Chercher un événement"
            className="pl-9"
            disabled={disabled}
          />
        </div>

        {full ? (
          <p className="text-micro text-text-3">
            {NEWSLETTER_MAX_EVENTS} événements au plus : au-delà, l’e-mail ne se lit plus.
          </p>
        ) : null}

        {results === null || loading ? (
          <p className="text-micro text-text-3">Recherche…</p>
        ) : results.length === 0 ? (
          <p className="text-micro text-text-3">Aucun événement publié à venir ne correspond.</p>
        ) : (
          <ul className="flex max-h-[280px] flex-col overflow-y-auto">
            {results.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-2 border-b border-border-subtle py-2 last:border-0"
              >
                <EventLine event={event} />
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  disabled={disabled || full || selectedIds.has(event.id)}
                  onClick={() => onChange([...value, event])}
                >
                  {selectedIds.has(event.id) ? 'Ajouté' : 'Ajouter'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EventLine({ event }: { event: NewsletterEvent }) {
  const price =
    event.fromPrice === null
      ? null
      : event.fromPrice === 0
        ? 'Gratuit'
        : `dès ${formatMoney(event.fromPrice, event.currency)}`;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-body-s font-bold">{event.title}</span>
      <span className="truncate text-micro text-text-3">
        {[
          formatEventCaptionWithTime(new Date(event.startsAt)),
          event.cityName,
          event.organizationName,
          price,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-button text-text-2 transition hover:bg-paper hover:text-text-strong disabled:opacity-35"
    >
      {children}
    </button>
  );
}
