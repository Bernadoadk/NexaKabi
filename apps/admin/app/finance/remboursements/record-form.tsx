'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Button, Field, Input, Textarea } from '@nexakabi/ui';

/**
 * Consigner un remboursement fait hors API.
 *
 * ── Quand ce geste sert ─────────────────────────────────────────────────────
 * Kkiapay ne rembourse par API que la totalité d'un paiement Mobile Money.
 * Une carte, un remboursement partiel, un refus de Kkiapay : l'argent se
 * renvoie à la main — depuis le tableau de bord de Kkiapay (Transactions →
 * Rembourser), ou par transfert Mobile Money vers le numéro qui a payé. Ce
 * formulaire en garde la trace ; le grand livre, lui, l'a déjà inscrit à la
 * décision.
 */
export function RecordRefundForm({
  refundId,
  amount,
  currency,
  payerPhone,
  payerPhoneMasked,
  methodLabel,
  label,
}: {
  refundId: string;
  amount: number;
  currency: string;
  payerPhone: string;
  payerPhoneMasked: boolean;
  methodLabel: string;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
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
        const note = String(form.get('note') ?? '').trim();

        try {
          const response = await fetch(`/api/admin/refunds/${refundId}/record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference, ...(note ? { note } : {}) }),
          });
          const payload = (await response.json()) as { message?: string };

          if (!response.ok) {
            setError(payload.message ?? 'Impossible d’enregistrer ce remboursement.');
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

      <p className="text-body-s text-text-2">
        Rends <strong className="text-text-strong">{formatMoney(amount, currency)}</strong> au{' '}
        <strong className="tabular text-text-strong">{payerPhone}</strong> ({methodLabel}) — depuis
        le tableau de bord de l’opérateur, ou par transfert —, puis indique la référence de
        l’opération.
        {payerPhoneMasked
          ? ' Le numéro complet est réservé aux comptes autorisés à déplacer de l’argent.'
          : null}
      </p>

      <Field
        label="Référence de l’opération"
        help="Le numéro de transaction du transfert ou du remboursement, pour le rapprochement."
        htmlFor={`refund-reference-${refundId}`}
      >
        <Input
          id={`refund-reference-${refundId}`}
          name="reference"
          required
          minLength={3}
          maxLength={80}
        />
      </Field>

      <Field label="Note" hint="· facultatif" htmlFor={`refund-note-${refundId}`}>
        <Textarea id={`refund-note-${refundId}`} name="note" rows={2} maxLength={500} />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="ink"
          size="compact"
          loading={pending}
          loadingLabel="Enregistrement…"
        >
          Enregistrer — le participant est remboursé
        </Button>
        <Button type="button" variant="tertiary" size="compact" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
