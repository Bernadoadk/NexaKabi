'use client';

import * as React from 'react';
import { CircleCheck, MapPin, Search, X } from 'lucide-react';
import type { PlaceDetails, PlaceSuggestion } from '@nexakabi/contracts';
import { cn } from '@nexakabi/ui';

/**
 * Recherche d'un lieu, par Google Places.
 *
 * ── Ce que l'organisateur vit ───────────────────────────────────────────────
 * Il tape « Palais des Congrès », la liste tombe sous le champ pendant qu'il
 * tape — avec une animation d'attente, jamais un silence — il en choisit un :
 * le nom, l'adresse, la ville et les coordonnées sont posés d'un coup, et une
 * confirmation verte le dit. S'il ne trouve pas, la liste le dit AUSSI, et
 * lui propose de continuer à la main : un champ qui ne répond rien laisse
 * croire qu'il est cassé.
 *
 * ── Ce que ce composant ne fait pas ─────────────────────────────────────────
 * Il ne parle jamais à Google : tout passe par le relais de l'application,
 * qui porte la session (et l'organisation, quand `basePath` le demande).
 * Aucun script tiers, aucune clé dans la page.
 *
 * ── Deux relais, un seul composant ──────────────────────────────────────────
 * `/api/pro/places` (défaut) exige une organisation active — c'est le lieu
 * d'un ÉVÉNEMENT. `/api/places` ne demande qu'une session — c'est SA PROPRE
 * adresse, cherchée avant même qu'une organisation existe (sa création) ou
 * pour la sienne (ses paramètres). `basePath` choisit lequel appeler ; le
 * reste — débounce, jeton de session, clavier — ne change pas.
 *
 * ── Session de recherche ────────────────────────────────────────────────────
 * Un jeton tiré à l'ouverture relie toutes les frappes et le détail du lieu
 * choisi : Google facture l'ensemble comme UNE session. Le jeton est renouvelé
 * après chaque sélection, puisque la session est alors consommée.
 */

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

type Status =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; items: PlaceSuggestion[]; query: string }
  | { kind: 'empty'; query: string }
  | { kind: 'resolving' }
  | { kind: 'error'; message: string };

function newSessionToken(): string {
  return crypto.randomUUID();
}

/** Découpe un libellé autour de la partie tapée, pour la mettre en gras. */
function highlight(text: string, query: string): React.ReactNode {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;

  const index = text.toLowerCase().indexOf(needle);
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[3px] bg-coral-50 px-0.5 text-coral-700">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

export function PlaceSearch({
  onSelect,
  onClear,
  disabled = false,
  basePath = '/api/pro/places',
  label = 'Rechercher le lieu',
  placeholder = 'Palais des Congrès, Sèmè City, Erevan…',
  selected = null,
  className,
}: {
  onSelect: (place: PlaceDetails) => void;
  /** Le lieu sélectionné est retiré (croix sur la confirmation). */
  onClear?: () => void;
  disabled?: boolean;
  /** `/api/pro/places` (lieu d'un événement) ou `/api/places` (sa propre adresse). */
  basePath?: string;
  label?: string;
  placeholder?: string;
  /** Lieu déjà retenu, affiché en confirmation. */
  selected?: PlaceDetails | null;
  className?: string;
}) {
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' });
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);

  const sessionRef = React.useRef(newSessionToken());
  const abortRef = React.useRef<AbortController | null>(null);
  // Le nom d'un lieu qu'on vient de CHOISIR : le champ le reçoit, ce n'est
  // pas une frappe, on ne relance pas une recherche dessus.
  const chosenNameRef = React.useRef<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  const suggestions = status.kind === 'results' ? status.items : [];

  // ── Recherche différée : une requête par pause de frappe ───────────────────
  React.useEffect(() => {
    const trimmed = query.trim();

    if (chosenNameRef.current !== null && trimmed === chosenNameRef.current) return;

    if (trimmed.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setStatus({ kind: 'idle' });
      setOpen(false);
      return;
    }

    setStatus((current) => (current.kind === 'results' ? current : { kind: 'searching' }));
    setOpen(true);

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus({ kind: 'searching' });

      try {
        const params = new URLSearchParams({ q: trimmed, session: sessionRef.current });
        const response = await fetch(`${basePath}/search?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? 'La recherche de lieux a échoué.');
        }

        const found = (await response.json()) as PlaceSuggestion[];
        if (controller.signal.aborted) return;

        setHighlighted(0);
        setStatus(
          found.length > 0
            ? { kind: 'results', items: found, query: trimmed }
            : { kind: 'empty', query: trimmed },
        );
        setOpen(true);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setStatus({
          kind: 'error',
          message: cause instanceof Error ? cause.message : 'La recherche de lieux a échoué.',
        });
        setOpen(true);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, basePath]);

  async function choose(suggestion: PlaceSuggestion) {
    // Une recherche encore en vol — la dernière frappe, en général — reviendrait
    // APRÈS la sélection et rouvrirait la liste. On la coupe ici.
    abortRef.current?.abort();

    setOpen(false);
    setStatus({ kind: 'resolving' });

    try {
      const params = new URLSearchParams({ session: sessionRef.current });
      const response = await fetch(
        `${basePath}/${encodeURIComponent(suggestion.placeId)}?${params.toString()}`,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Ce lieu n’a pas pu être localisé.');
      }

      const details = (await response.json()) as PlaceDetails;

      // Le nom retenu est celui que l'organisateur a CLIQUÉ. La fiche Google
      // porte parfois le nom de l'enseigne principale — « Super U » pour le
      // centre commercial Erevan — qui n'est pas ce qu'il cherchait.
      const place: PlaceDetails = { ...details, name: suggestion.mainText || details.name };

      chosenNameRef.current = '';
      setQuery('');
      setStatus({ kind: 'idle' });
      onSelect(place);

      // La session est consommée par le détail : la suivante repart de zéro.
      sessionRef.current = newSessionToken();
    } catch (cause) {
      setStatus({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'Ce lieu n’a pas pu être localisé.',
      });
      setOpen(true);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (!open || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = suggestions[highlighted];
      if (target) void choose(target);
    }
  }

  const busy = status.kind === 'searching' || status.kind === 'resolving';
  const showList = open && query.trim().length >= MIN_QUERY_LENGTH && status.kind !== 'idle';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative flex flex-col gap-1.5">
        <label htmlFor={`${listId}-input`} className="text-body-s font-semibold text-text-strong">
          {label}
          <span className="ml-1 font-normal text-text-3">· Google Maps</span>
        </label>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-text-3"
            aria-hidden
          />
          <input
            ref={inputRef}
            id={`${listId}-input`}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-busy={busy || undefined}
            aria-activedescendant={
              showList && suggestions.length > 0 ? `${listId}-${highlighted}` : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            disabled={disabled}
            value={query}
            placeholder={placeholder}
            onChange={(event) => {
              chosenNameRef.current = null;
              setQuery(event.target.value);
            }}
            onFocus={() => {
              if (status.kind !== 'idle') setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            className={cn(
              'min-h-[var(--tap-mobile)] w-full rounded-field border border-border-field bg-surface pl-10 pr-11 text-[15px] text-text',
              'placeholder:text-text-3 transition-[border-color,box-shadow] duration-(--duration-hover)',
              'focus:border-text-strong focus:shadow-[var(--focus-ring)] focus:outline-none',
              'disabled:bg-fill-neutral disabled:text-text-disabled',
            )}
          />

          <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
            {busy ? (
              <span
                aria-hidden
                className="mr-2.5 inline-block size-4 rounded-full border-2 border-coral/30 border-t-coral animate-nk-spin"
              />
            ) : query ? (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  chosenNameRef.current = null;
                  setQuery('');
                  setStatus({ kind: 'idle' });
                  setOpen(false);
                  inputRef.current?.focus();
                }}
                className="flex size-9 items-center justify-center rounded-full text-text-3 transition hover:bg-surface-alt hover:text-text-strong"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </span>
        </div>

        {showList ? (
          <div
            className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-card border border-border bg-surface shadow-lg"
            onMouseDown={(event) => {
              // `mousedown` plutôt que `click` : le `blur` du champ ferme la
              // liste avant qu'un `click` n'arrive.
              event.preventDefault();
            }}
          >
            {status.kind === 'searching' ? (
              <ul className="flex flex-col py-1" aria-hidden>
                {[0, 1, 2].map((row) => (
                  <li key={row} className="flex items-center gap-3 px-3.5 py-3">
                    <span className="size-8 shrink-0 rounded-[10px] bg-fill-muted animate-nk-pulse" />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <span
                        className="h-3 rounded-full bg-fill-muted animate-nk-pulse"
                        style={{ width: `${62 - row * 12}%` }}
                      />
                      <span
                        className="h-2.5 rounded-full bg-fill-muted/70 animate-nk-pulse"
                        style={{ width: `${44 - row * 6}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {status.kind === 'results' ? (
              <ul id={listId} role="listbox" className="max-h-[300px] overflow-y-auto py-1">
                {status.items.map((suggestion, index) => (
                  <li
                    key={suggestion.placeId}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === highlighted}
                    onClick={() => void choose(suggestion)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      'flex min-h-[var(--tap-min)] cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors',
                      index === highlighted ? 'bg-paper' : '',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-[10px]',
                        index === highlighted ? 'bg-coral text-ink' : 'bg-coral-50 text-coral-700',
                      )}
                      aria-hidden
                    >
                      <MapPin className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-semibold text-text-strong">
                        {highlight(suggestion.mainText, status.query)}
                      </span>
                      {suggestion.secondaryText ? (
                        <span className="truncate text-micro text-text-2">
                          {suggestion.secondaryText}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {status.kind === 'empty' ? (
              <div className="flex items-start gap-3 px-4 py-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-fill-neutral text-text-3">
                  <MapPin className="size-[18px]" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-body font-semibold text-text-strong">
                    Aucun lieu trouvé pour « {status.query} »
                  </p>
                  <p className="text-body-s text-text-2">
                    Essaie avec le quartier ou la ville (« Fidjrossè », « Calavi »), ou saisis le
                    lieu à la main dans les champs ci-dessous : tu pourras le placer sur la carte.
                  </p>
                </div>
              </div>
            ) : null}

            {status.kind === 'error' ? (
              <div className="flex items-start gap-3 px-4 py-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-red-50 text-red-700">
                  <X className="size-[18px]" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-body font-semibold text-text-strong">Recherche indisponible</p>
                  <p className="text-body-s text-text-2">{status.message}</p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-border-subtle bg-surface-alt px-3.5 py-1.5 text-[10.5px] text-text-3">
              <span>↑↓ pour naviguer · Entrée pour choisir</span>
              <span>Suggestions fournies par Google</span>
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="flex items-start gap-3 rounded-card border border-mint-200 bg-mint-50 px-3.5 py-3">
          <CircleCheck className="mt-0.5 size-[18px] shrink-0 text-mint-700" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-body font-semibold text-text-strong">{selected.name}</p>
            <p className="truncate text-body-s text-text-2">
              {selected.address ?? 'Lieu localisé'}
              {selected.cityName && !selected.address?.includes(selected.cityName)
                ? ` · ${selected.cityName}`
                : ''}
            </p>
          </div>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              aria-label="Retirer ce lieu"
              className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-text-3 transition hover:bg-mint-200/60 hover:text-text-strong"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-micro text-text-3" aria-live="polite">
          {status.kind === 'resolving'
            ? 'Localisation du lieu…'
            : 'Tape le nom d’une salle, d’un hôtel, d’un quartier. Tu peux aussi remplir les champs à la main.'}
        </p>
      )}
    </div>
  );
}
