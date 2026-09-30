'use client';

import { cn } from '@nexakabi/ui';

/**
 * Une ligne de réglage : un libellé, une phrase qui dit ce qu'elle engage, un
 * interrupteur.
 *
 * `role="switch"` plutôt qu'une case à cocher : un lecteur d'écran annonce
 * « activé / désactivé », ce qui décrit l'effet, là où « coché » décrit
 * seulement l'apparence.
 *
 * `locked` : toujours actif, avec sa raison — un réglage absent laisse croire
 * à un oubli. `disabled` : impossible pour l'instant (pas d'adresse e-mail,
 * navigateur sans notifications), la phrase dit pourquoi.
 */
export function SettingsRow({
  label,
  hint,
  checked,
  locked = false,
  disabled = false,
  busy = false,
  onToggle,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  locked?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onToggle?: () => void;
  /** Complément sous la phrase — un lien, une précision. */
  children?: React.ReactNode;
}) {
  const inert = locked || disabled;

  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle py-3 last:border-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('text-body-s font-semibold', inert && 'text-text-2')}>{label}</span>
        {hint ? <span className="text-micro leading-snug text-text-3">{hint}</span> : null}
        {children}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-busy={busy || undefined}
        disabled={inert || busy}
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          // La zone tactile réelle dépasse le dessin : 24 px de haut serait sous
          // le minimum, et un réglage qu'on rate trois fois passe pour cassé.
          'before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[""]',
          checked ? 'bg-coral' : 'bg-border',
          inert && 'cursor-not-allowed opacity-45',
          busy && 'cursor-wait opacity-70',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-[left]',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

/** En-tête d'un groupe de réglages. */
export function SettingsGroup({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-micro font-bold uppercase tracking-wide text-text-3">
        {legend}
      </legend>
      {description ? <p className="mb-1 text-micro text-text-3">{description}</p> : null}
      {children}
    </fieldset>
  );
}
