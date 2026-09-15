'use client';

import * as React from 'react';
import { Surface, cn } from '@nexakabi/ui';
import type { NotificationPreferencesState } from '@/lib/notifications';

/**
 * Réglages des alertes.
 *
 * ── Ce qui n'a pas d'interrupteur, et pourquoi on le dit quand même ────────
 * Les confirmations de paiement et les annulations ne se désactivent pas : la
 * première porte un billet, la seconde évite un déplacement pour rien. Plutôt
 * que de les taire, l'écran les affiche comme toujours actives.
 *
 * Un réglage absent laisse croire à un oubli ; un réglage grisé avec sa raison
 * répond à la question avant qu'elle soit posée, et évite un message au support.
 *
 * ── Enregistrement immédiat ────────────────────────────────────────────────
 * Pas de bouton « Enregistrer ». Un interrupteur qui bascule PUIS attend une
 * validation ment sur son état pendant l'attente, et sur mobile la moitié des
 * gens quittent la page avant. Chaque bascule part seule ; en cas d'échec,
 * l'interrupteur revient à sa position d'origine avec un message.
 */
export function PreferencesForm({ initial }: { initial: NotificationPreferencesState }) {
  const [state, setState] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle(key: keyof NotificationPreferencesState) {
    const next = { ...state, [key]: !state[key] };

    setState(next);
    setError(null);

    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next[key] }),
      });

      if (!response.ok) throw new Error();
    } catch {
      // Remettre l'interrupteur là où il était : afficher un état qu'on n'a pas
      // réussi à enregistrer serait le pire des deux mondes.
      setState(state);
      setError('Le réglage n’a pas pu être enregistré. Réessaie dans un instant.');
    }
  }

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-bold">Réglages</h2>
        <p className="text-body-s text-text-2">
          Nexa-Kabi n’envoie jamais de publicité. Seulement ce qui concerne tes billets.
        </p>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-micro font-bold uppercase tracking-wide text-text-3">
          Ce que je reçois
        </legend>

        <Row
          label="Rappels avant mes événements"
          hint="Une semaine avant, la veille, et quelques heures avant."
          checked={state.eventReminders}
          onToggle={() => void toggle('eventReminders')}
        />
        <Row
          label="Nouveaux événements des organisateurs suivis"
          hint="Uniquement ceux dont tu as déjà acheté un billet."
          checked={state.organizerPublications}
          onToggle={() => void toggle('organizerPublications')}
        />
        <Row
          label="Confirmations de paiement et annulations"
          hint="Toujours actif : ces messages portent ton billet ou t’évitent un déplacement."
          checked
          locked
        />
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-micro font-bold uppercase tracking-wide text-text-3">
          Par quel moyen
        </legend>

        <Row label="WhatsApp" checked={state.whatsapp} onToggle={() => void toggle('whatsapp')} />
        <Row label="SMS" checked={state.sms} onToggle={() => void toggle('sms')} />
        <Row
          label="E-mail"
          hint="Nécessite une adresse renseignée sur ton compte."
          checked={state.email}
          onToggle={() => void toggle('email')}
        />
      </fieldset>

      {error ? (
        <p role="alert" className="text-body-s font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}

/**
 * Une ligne de réglage.
 *
 * `role="switch"` plutôt qu'une case à cocher : un lecteur d'écran annonce
 * « activé / désactivé », ce qui décrit l'effet, là où « coché » décrit
 * seulement l'apparence.
 */
function Row({
  label,
  hint,
  checked,
  locked = false,
  onToggle,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle py-3 last:border-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('text-body-s font-semibold', locked && 'text-text-2')}>{label}</span>
        {hint ? <span className="text-micro leading-snug text-text-3">{hint}</span> : null}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={locked}
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          // La zone tactile réelle dépasse le dessin : 24 px de haut serait sous
          // le minimum, et un réglage qu'on rate trois fois passe pour cassé.
          'before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[""]',
          checked ? 'bg-coral' : 'bg-border',
          locked && 'cursor-not-allowed opacity-45',
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
