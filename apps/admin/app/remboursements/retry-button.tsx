'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@nexakabi/ui';

/**
 * Confier (ou reconfier) un remboursement au prestataire.
 *
 * Sans risque de doublon : la demande porte une clé d'idempotence, et une
 * réponse perdue se relance avec la même clé.
 */
export function RetryButton({ refundId, label }: { refundId: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        type="button"
        variant="ink"
        size="compact"
        loading={pending}
        loadingLabel="Envoi…"
        onClick={async () => {
          setPending(true);
          setError(null);

          try {
            const response = await fetch(`/api/admin/refunds/${refundId}/retry`, {
              method: 'POST',
            });
            const payload = (await response.json()) as { message?: string };

            if (!response.ok) {
              setError(payload.message ?? 'Le prestataire n’a pas pu prendre ce remboursement.');
              return;
            }

            router.refresh();
          } catch {
            setError('L’API n’est pas joignable.');
          } finally {
            setPending(false);
          }
        }}
      >
        {label}
      </Button>
    </div>
  );
}
