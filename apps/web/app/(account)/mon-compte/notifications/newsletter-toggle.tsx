'use client';

import * as React from 'react';
import type { AccountNewsletter } from '@nexakabi/contracts';
import { Surface } from '@nexakabi/ui';
import { SettingsRow } from './settings-row';

/**
 * La newsletter, depuis les réglages du compte.
 *
 * S'abonner envoie un lien de confirmation à l'adresse du compte : tant qu'il
 * n'est pas ouvert, rien ne part. L'écran le dit — « en attente » — plutôt que
 * d'afficher un interrupteur activé qui ne fait encore rien.
 */
export function NewsletterToggle({
  initial,
  accountEmail,
}: {
  initial: AccountNewsletter;
  accountEmail: string | null;
}) {
  const [state, setState] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const subscribed = state.status === 'ACTIVE' || state.status === 'PENDING';

  async function toggle() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/me/newsletter', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed: !subscribed }),
      });

      const payload = (await response.json().catch(() => null)) as
        (AccountNewsletter & { message?: string }) | null;

      if (!response.ok || !payload) {
        setError(payload?.message ?? 'Le réglage n’a pas pu être enregistré.');
        return;
      }

      setState({ status: payload.status, email: payload.email });
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setBusy(false);
    }
  }

  const hint = !accountEmail
    ? 'Ajoute une adresse e-mail dans « Mon compte » pour t’y abonner.'
    : state.status === 'PENDING'
      ? `En attente : ouvre le lien de confirmation envoyé à ${state.email ?? accountEmail}.`
      : state.status === 'ACTIVE'
        ? `Tu la reçois à ${state.email ?? accountEmail}. Chaque envoi contient un lien pour te désabonner.`
        : 'Les sorties à ne pas manquer, de temps en temps, par e-mail. Un lien de confirmation t’est envoyé.';

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-2">
      <h2 className="text-h3 font-bold">Newsletter</h2>

      <SettingsRow
        label="Recevoir la newsletter Nexa‑Kabi"
        hint={hint}
        checked={subscribed}
        disabled={!accountEmail && !subscribed}
        busy={busy}
        onToggle={() => void toggle()}
      />

      {error ? (
        <p role="alert" className="text-body-s font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}
