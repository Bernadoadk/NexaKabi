'use client';

import * as React from 'react';
import { Banknote } from 'lucide-react';
import {
  ADMIN_SPACES,
  type AdminAccess,
  type AdminAccessLevel,
  type AdminSpace,
} from '@nexakabi/contracts';
import { cn } from '@nexakabi/ui';

/**
 * La grille des droits d'un employé.
 *
 * Une ligne par espace, trois positions : aucun accès, consultation,
 * décision. Puis, à part, la case des mouvements d'argent — jamais impliquée
 * par un espace, pour qu'on la coche en connaissance de cause. Le prototype
 * refuse les matrices de cases pour les rôles d'ORGANISATION, présentés par
 * une phrase ; ici c'est le propriétaire qui compose des droits sur mesure,
 * et il doit voir ce qu'il donne.
 */
const LEVELS: ReadonlyArray<{ value: 'none' | AdminAccessLevel; label: string }> = [
  { value: 'none', label: 'Aucun' },
  { value: 'read', label: 'Consultation' },
  { value: 'act', label: 'Décision' },
];

export function AccessEditor({
  access,
  canMoveMoney,
  onChange,
  disabled = false,
}: {
  access: AdminAccess;
  canMoveMoney: boolean;
  onChange: (next: { access: AdminAccess; canMoveMoney: boolean }) => void;
  disabled?: boolean;
}) {
  function setLevel(space: AdminSpace, level: 'none' | AdminAccessLevel) {
    const next: AdminAccess = { ...access };
    if (level === 'none') delete next[space];
    else next[space] = level;
    onChange({ access: next, canMoveMoney });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border-subtle rounded-card border border-border">
        {ADMIN_SPACES.map((space) => {
          const current = access[space.key] ?? 'none';

          return (
            <li
              key={space.key}
              className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-text-strong">{space.label}</p>
                <p className="text-micro text-text-2">{space.description}</p>
              </div>

              <div
                role="radiogroup"
                aria-label={`Accès à ${space.label}`}
                className="flex shrink-0 rounded-field bg-paper p-1"
              >
                {LEVELS.map((level) => {
                  const active = current === level.value;
                  return (
                    <button
                      key={level.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() => setLevel(space.key, level.value)}
                      className={cn(
                        'min-h-[34px] rounded-[8px] px-3 text-body-s font-semibold transition-colors disabled:opacity-50',
                        active
                          ? level.value === 'none'
                            ? 'bg-surface text-text-2 shadow-sm'
                            : level.value === 'read'
                              ? 'bg-surface text-text-strong shadow-sm'
                              : 'bg-ink text-white'
                          : 'text-text-3 hover:text-text-strong',
                      )}
                    >
                      {level.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <label
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-card border p-3.5 transition-colors',
          canMoveMoney ? 'border-amber-200 bg-amber-50' : 'border-border bg-surface',
        )}
      >
        <input
          type="checkbox"
          checked={canMoveMoney}
          disabled={disabled}
          onChange={(event) => onChange({ access, canMoveMoney: event.target.checked })}
          className="mt-1 size-[18px] accent-[var(--color-coral)]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 text-body font-semibold text-text-strong">
            <Banknote className="size-4 text-amber-600" aria-hidden />
            Mouvements d’argent
          </span>
          <span className="text-micro text-text-2">
            Exécuter ou enregistrer un retrait, geler ou dégeler des fonds. Un espace ne le donne
            jamais tout seul : c’est un droit à part, à accorder en connaissance de cause. Il
            s’exerce dans les espaces « Retraits » et « Organisations » au niveau Décision.
          </span>
        </span>
      </label>
    </div>
  );
}
