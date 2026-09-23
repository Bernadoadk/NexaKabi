'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ReconciliationRun } from '@nexakabi/contracts';
import { Alert, Button } from '@nexakabi/ui';

/**
 * Lancer une passe de rapprochement sans attendre la minute suivante.
 *
 * Utile quand un opérateur signale un incident, ou qu'un acheteur appelle :
 * la passe interroge le prestataire sur tout ce qui est en attente, et dit
 * ce qu'elle a rattrapé. Elle ne double jamais une passe automatique en cours.
 */
export function RunButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="ink"
        size="compact"
        loading={pending}
        loadingLabel="Passe en cours…"
        onClick={async () => {
          setPending(true);
          setMessage(null);

          try {
            const response = await fetch('/api/admin/finance/reconciliation/run', {
              method: 'POST',
            });
            const payload = (await response.json()) as ReconciliationRun & { message?: string };

            if (!response.ok) {
              setMessage({
                tone: 'danger',
                text: payload.message ?? 'La passe n’a pas pu tourner.',
              });
              return;
            }

            setMessage({ tone: 'success', text: describe(payload) });
            router.refresh();
          } catch {
            setMessage({ tone: 'danger', text: 'L’API n’est pas joignable.' });
          } finally {
            setPending(false);
          }
        }}
      >
        Lancer une passe maintenant
      </Button>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
    </div>
  );
}

function describe(run: ReconciliationRun): string {
  return [
    `${run.payments.inspected} paiement(s) interrogé(s), ${run.payments.recovered} rattrapé(s), ${run.payments.expired} expiré(s)`,
    `${run.payments.orphanWebhooks} notification(s) orpheline(s) reprise(s)`,
    `${run.payouts.paid + run.payouts.failed} retrait(s) conclu(s)`,
    `${run.refunds.completed + run.refunds.failed} remboursement(s) conclu(s)`,
  ].join(' · ');
}
