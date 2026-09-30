'use client';

import * as React from 'react';
import type { PlatformNotificationSettings } from '@nexakabi/contracts';
import { Surface, cn } from '@nexakabi/ui';

/**
 * Réglages des envois aux participants — ce que la PLATEFORME accepte.
 *
 * Les participants choisissent ce qu'ils veulent recevoir ; ces deux
 * interrupteurs décident de ce que la plateforme accepte d'envoyer, et de
 * payer. Chaque bascule est enregistrée aussitôt et tracée au journal.
 */
export function SettingsCard({
  initial,
  canAct,
}: {
  initial: PlatformNotificationSettings;
  canAct: boolean;
}) {
  const [state, setState] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<keyof PlatformNotificationSettings | null>(null);

  async function toggle(key: keyof PlatformNotificationSettings) {
    const previous = state;
    setState({ ...state, [key]: !state[key] });
    setBusy(key);
    setError(null);

    try {
      const response = await fetch('/api/admin/newsletter/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: !previous[key] }),
      });

      const payload = (await response.json().catch(() => null)) as
        (PlatformNotificationSettings & { message?: string }) | null;

      if (!response.ok || !payload) {
        setState(previous);
        setError(payload?.message ?? 'Le réglage n’a pas pu être enregistré.');
        return;
      }

      setState({
        recommendationsEnabled: payload.recommendationsEnabled,
        whatsappForNonUrgent: payload.whatsappForNonUrgent,
      });
    } catch {
      setState(previous);
      setError('L’API n’est pas joignable.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-2">
      <h2 className="text-h3 font-bold">Réglages des envois</h2>
      <p className="text-body-s text-text-2">
        Valables pour tous les participants, quels que soient leurs choix. Les confirmations de
        paiement et les annulations partent toujours.
      </p>

      <Toggle
        label="Sélection hebdomadaire selon les goûts"
        hint="Coupée : plus aucune sélection n’est calculée ni envoyée. Les participants gardent leur réglage pour la reprise."
        checked={state.recommendationsEnabled}
        disabled={!canAct}
        busy={busy === 'recommendationsEnabled'}
        onToggle={() => void toggle('recommendationsEnabled')}
      />
      <Toggle
        label="WhatsApp pour les messages non urgents"
        hint="Rappels, publications des organisateurs suivis, sélections. Coupé : ils ne partent plus que dans l’application, par notification et par e-mail — un WhatsApp coûte à chaque envoi."
        checked={state.whatsappForNonUrgent}
        disabled={!canAct}
        busy={busy === 'whatsappForNonUrgent'}
        onToggle={() => void toggle('whatsappForNonUrgent')}
      />

      {error ? (
        <p role="alert" className="text-body-s font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  busy,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle py-3 last:border-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-s font-semibold">{label}</span>
        <span className="text-micro leading-snug text-text-3">{hint}</span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled || busy}
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          'before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[""]',
          checked ? 'bg-coral' : 'bg-border',
          disabled && 'cursor-not-allowed opacity-45',
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
