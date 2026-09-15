'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input, Textarea } from '@nexakabi/ui';

/**
 * Consigner un versement fait hors plateforme.
 *
 * ── Pourquoi ce formulaire existe ──────────────────────────────────────────
 * « Exécuter » ne sait verser que par un opérateur. Un virement bancaire se
 * fait depuis la banque ; et quand un opérateur refuse, le message renvoyait
 * vers un enregistrement manuel… que rien ne permettait. L'administrateur
 * restait avec un retrait « en attente » et un virement déjà parti.
 *
 * Deux issues, une référence, une cause en cas d'échec : ce que la machine à
 * états du retrait exige, rien de plus.
 */
export function RecordPayoutForm({
  payoutId,
  label = 'Enregistrer à la main',
}: {
  payoutId: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<'PAID' | 'FAILED'>('PAID');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="compact" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-3 rounded-card border border-border-subtle bg-paper p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);

        const form = new FormData(event.currentTarget);
        const reference = String(form.get('reference') ?? '').trim();
        const failureReason = String(form.get('failureReason') ?? '').trim();

        try {
          const response = await fetch(`/api/admin/payouts/${payoutId}/record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              outcome,
              ...(reference ? { reference } : {}),
              ...(outcome === 'FAILED' ? { failureReason } : {}),
            }),
          });
          const payload = (await response.json()) as { message?: string };

          if (!response.ok) {
            setError(payload.message ?? 'Impossible d’enregistrer ce versement.');
            return;
          }

          setOpen(false);
          router.refresh();
        } catch {
          setError('L’API n’est pas joignable.');
        } finally {
          setPending(false);
        }
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-body-s font-semibold">Issue du versement</legend>
        <label className="flex cursor-pointer items-center gap-2 text-body-s">
          <input
            type="radio"
            name="outcome"
            value="PAID"
            checked={outcome === 'PAID'}
            onChange={() => setOutcome('PAID')}
          />
          Effectué — l’argent est parti
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-body-s">
          <input
            type="radio"
            name="outcome"
            value="FAILED"
            checked={outcome === 'FAILED'}
            onChange={() => setOutcome('FAILED')}
          />
          Échoué — le montant est restitué à l’organisateur
        </label>
      </fieldset>

      <Field
        label="Référence du virement"
        hint="· facultatif"
        help="Le numéro d’opération de la banque ou de l’opérateur, pour le rapprochement."
        htmlFor={`reference-${payoutId}`}
      >
        <Input id={`reference-${payoutId}`} name="reference" maxLength={80} />
      </Field>

      {outcome === 'FAILED' ? (
        <Field
          label="Cause de l’échec"
          help="Montrée à l’organisateur : elle doit lui permettre de corriger son compte."
          htmlFor={`failure-${payoutId}`}
        >
          <Textarea
            id={`failure-${payoutId}`}
            name="failureReason"
            required
            minLength={5}
            rows={2}
          />
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="ink"
          size="compact"
          loading={pending}
          loadingLabel="Enregistrement…"
        >
          Enregistrer
        </Button>
        <Button type="button" variant="tertiary" size="compact" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
