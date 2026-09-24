'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { AttachPaymentTransactionResult } from '@nexakabi/contracts';
import { Alert, Button, Surface } from '@nexakabi/ui';

const FIELD =
  'h-10 w-full rounded-field border border-border-field bg-surface px-3 text-body-s text-text-strong';

/**
 * Rattacher une transaction du prestataire à un paiement resté sans issue.
 *
 * ── Le cas qu'il résout ─────────────────────────────────────────────────────
 * L'acheteur a payé dans la fenêtre de paiement, mais sa page s'est fermée et
 * la notification du prestataire s'est perdue : nous ne connaissons pas sa
 * transaction. Il se présente au support avec sa référence — reçu SMS, e-mail
 * du prestataire, ou tableau de bord Kkiapay.
 *
 * La référence saisie n'est qu'une piste : le serveur la lit chez le
 * prestataire et ne l'accepte que si elle porte l'identifiant de CE paiement
 * et le bon montant. Rien ne s'émet sur la foi de ce formulaire seul.
 */
export function AttachTransactionForm({
  paymentId,
  providerLabel,
}: {
  paymentId: string;
  providerLabel: string;
}) {
  const router = useRouter();
  const [reference, setReference] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{
    tone: 'success' | 'warning' | 'danger';
    text: string;
  } | null>(null);

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="text-body font-bold">Rattacher une transaction {providerLabel}</h2>
        <p className="text-micro text-text-3">
          L’acheteur dit avoir payé ? Saisis la référence de sa transaction : elle est vérifiée chez{' '}
          {providerLabel}, et n’est retenue que si elle correspond à ce paiement et à son montant.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 px-5 py-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!reference.trim()) return;

          setPending(true);
          setMessage(null);

          try {
            const response = await fetch(
              `/api/admin/finance/payments/${encodeURIComponent(paymentId)}/attach`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providerReference: reference.trim() }),
              },
            );
            const payload = (await response.json().catch(() => null)) as
              (AttachPaymentTransactionResult & { message?: string }) | { message?: string } | null;

            if (!response.ok || !payload || !('outcome' in payload)) {
              setMessage({
                tone: 'danger',
                text: payload?.message ?? 'La transaction n’a pas pu être vérifiée.',
              });
              return;
            }

            setMessage({
              tone:
                payload.outcome === 'settled' || payload.outcome === 'already'
                  ? 'success'
                  : payload.outcome === 'pending' || payload.outcome === 'failed'
                    ? 'warning'
                    : 'danger',
              text: payload.message,
            });
            setReference('');
            router.refresh();
          } catch {
            setMessage({ tone: 'danger', text: 'L’API n’est pas joignable.' });
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="flex flex-col gap-1 text-micro font-semibold text-text-2">
          Référence de la transaction
          <input
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Ex. 3iH6wjHJ3"
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            className={FIELD}
          />
        </label>
        <div>
          <Button
            type="submit"
            variant="ink"
            size="compact"
            loading={pending}
            loadingLabel="Vérification…"
            disabled={!reference.trim()}
          >
            Vérifier et rattacher
          </Button>
        </div>
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      </form>
    </Surface>
  );
}
