'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ORDER_REFERENCE_PATTERN, formatEventCaptionWithTime, formatMoney } from '@nexakabi/utils';
import {
  REFUND_REASON_LABELS,
  type CreateRefundInput,
  type RefundPreview,
} from '@nexakabi/contracts';
import { Alert, Button, Field, Input, Select, Surface, Textarea } from '@nexakabi/ui';

const REASONS: readonly CreateRefundInput['reason'][] = [
  'CUSTOMER_REQUEST',
  'DUPLICATE_PAYMENT',
  'DISPUTE',
  'ADMIN',
];

/** Une commande remboursée sans ses frais peut encore les recevoir. */
const REFUNDABLE_STATUSES = new Set(['PAID', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED']);

/**
 * Rembourser une commande.
 *
 * En deux temps, et c'est voulu : on retrouve d'abord la commande — qui a
 * payé, combien, déjà remboursé ou non —, et seulement ensuite on décide. Un
 * remboursement retire l'argent du solde de l'organisateur dès sa décision :
 * il ne se lance pas sur une référence tapée à l'aveugle.
 */
export function NewRefundForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reference, setReference] = React.useState('');
  const [preview, setPreview] = React.useState<RefundPreview | null>(null);
  const [reason, setReason] = React.useState<CreateRefundInput['reason']>('CUSTOMER_REQUEST');
  const [refundFees, setRefundFees] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  function reset() {
    setReference('');
    setPreview(null);
    setReason('CUSTOMER_REQUEST');
    setRefundFees(false);
    setNote('');
    setError(null);
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        {done ? (
          <Alert tone="success" title="Remboursement décidé">
            {done}
          </Alert>
        ) : null}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => {
              setDone(null);
              setOpen(true);
            }}
          >
            Rembourser une commande
          </Button>
        </div>
      </div>
    );
  }

  const normalized = reference.trim().toUpperCase();

  async function lookup() {
    setPending(true);
    setError(null);
    setPreview(null);

    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(normalized)}/refund-preview`,
      );
      const payload = (await response.json()) as RefundPreview & { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'Commande introuvable.');
        return;
      }

      setPreview(payload);
      // Des frais de service qu'il n'y a pas ne se proposent pas.
      setRefundFees(false);
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  async function submit() {
    if (!preview) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(preview.orderReference)}/refunds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, note: note.trim(), refundFees }),
        },
      );
      const payload = (await response.json()) as {
        message?: string;
        status?: string;
        failureReason?: string | null;
      };

      if (!response.ok) {
        setError(payload.message ?? 'Le remboursement n’a pas pu être décidé.');
        return;
      }

      setDone(
        payload.status === 'COMPLETED'
          ? `${preview.orderReference} : le participant est remboursé.`
          : payload.status === 'PROCESSING'
            ? `${preview.orderReference} : l’opérateur rembourse le participant, l’issue arrivera d’elle-même.`
            : `${preview.orderReference} : à faire à la main — ${payload.failureReason ?? 'voir la file « À faire »'}.`,
      );
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  const refundable = preview
    ? refundFees
      ? preview.refundableWithFees
      : preview.refundableWithoutFees
    : 0;
  const blocker = preview
    ? refundFees
      ? preview.automaticBlockerWithFees
      : preview.automaticBlockerWithoutFees
    : null;
  const refundableStatus = preview ? REFUNDABLE_STATUSES.has(preview.orderStatus) : false;
  const noteValid = note.trim().length >= 10;

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-body font-bold">Rembourser une commande</h2>
        <Button
          type="button"
          variant="tertiary"
          size="compact"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Fermer
        </Button>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
      >
        <Field
          label="Référence de la commande"
          help="Celle que le participant communique au support : NK- suivi de six caractères."
          htmlFor="refund-order-reference"
          className="min-w-[220px] flex-1"
        >
          <Input
            id="refund-order-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="NK-8F4C21"
            autoComplete="off"
            required
          />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          size="compact"
          loading={pending && !preview}
          loadingLabel="Recherche…"
          disabled={!ORDER_REFERENCE_PATTERN.test(normalized)}
        >
          Retrouver
        </Button>
      </form>

      {preview ? (
        <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
          <dl className="grid gap-x-6 gap-y-1 text-body-s sm:grid-cols-2">
            <Detail label="Événement">{preview.eventTitle}</Detail>
            <Detail label="Organisation">{preview.organizationName}</Detail>
            <Detail label="Acheteur">{preview.buyerName}</Detail>
            <Detail label="Payé">
              {preview.paidAt ? formatEventCaptionWithTime(new Date(preview.paidAt)) : '—'}
              {preview.methodLabel ? ` · ${preview.methodLabel}` : ''}
            </Detail>
            <Detail label="Total payé">{formatMoney(preview.totalAmount, preview.currency)}</Detail>
            <Detail label="Déjà remboursé">
              {formatMoney(preview.alreadyRefunded, preview.currency)}
            </Detail>
          </dl>

          {!refundableStatus || preview.refundableWithFees <= 0 ? (
            <Alert tone="warning" title="Rien à rembourser">
              Cette commande n’a pas été payée, ou elle a déjà été entièrement remboursée.
            </Alert>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Field label="Motif" htmlFor="refund-reason">
                <Select
                  id="refund-reason"
                  value={reason}
                  onValueChange={(value) => setReason(value as CreateRefundInput['reason'])}
                  options={REASONS.map((value) => ({
                    value,
                    label: REFUND_REASON_LABELS[value],
                  }))}
                />
              </Field>

              {preview.buyerFeeAmount > 0 ? (
                <label className="flex cursor-pointer items-start gap-2 text-body-s">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={refundFees}
                    onChange={(event) => setRefundFees(event.target.checked)}
                  />
                  <span>
                    Rendre aussi les frais de service (
                    {formatMoney(preview.buyerFeeAmount, preview.currency)}). Ils ne le sont pas
                    d’ordinaire : le service a été rendu.
                  </span>
                </label>
              ) : null}

              <Alert tone={blocker ? 'warning' : 'info'}>
                {blocker
                  ? `À faire à la main : ${blocker}`
                  : 'L’opérateur remboursera ce montant sur le numéro qui a payé ; l’issue arrivera d’elle-même.'}
              </Alert>

              <Field
                label="Motif détaillé"
                help="Relu par quelqu’un d’autre, et conservé dans le journal d’audit."
                error={note.length > 0 && !noteValid ? 'dix caractères au moins' : undefined}
                htmlFor="refund-note"
              >
                <Textarea
                  id="refund-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  maxLength={500}
                  required
                />
              </Field>

              <div>
                <Button
                  type="submit"
                  variant="ink"
                  size="compact"
                  loading={pending}
                  loadingLabel="Décision…"
                  disabled={!noteValid || refundable <= 0}
                >
                  Rembourser {formatMoney(refundable, preview.currency)}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </Surface>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:justify-start">
      <dt className="text-text-3">{label}</dt>
      <dd className="font-semibold text-text-strong">{children}</dd>
    </div>
  );
}
