'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@nexakabi/ui';

/**
 * Fermer une politique sans la remplacer : la portée retombe sur la politique
 * moins spécifique — une remise d'organisation qui prend fin rend
 * l'organisation au tarif de son pays.
 */
export function CloseButton({ policyId }: { policyId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!confirming) {
    return (
      <Button type="button" variant="tertiary" size="compact" onClick={() => setConfirming(true)}>
        Fermer
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive-solid"
          size="compact"
          loading={pending}
          loadingLabel="Fermeture…"
          onClick={async () => {
            setPending(true);
            setError(null);

            try {
              const response = await fetch(`/api/admin/finance/commissions/${policyId}/close`, {
                method: 'POST',
              });
              const payload = (await response.json()) as { message?: string };

              if (!response.ok) {
                setError(payload.message ?? 'La politique n’a pas pu être fermée.');
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
          Confirmer la fermeture
        </Button>
        <Button
          type="button"
          variant="tertiary"
          size="compact"
          onClick={() => setConfirming(false)}
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}
