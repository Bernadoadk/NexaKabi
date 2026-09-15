'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@nexakabi/ui';

/**
 * Verser un retrait chez l'opérateur.
 *
 * `POST /admin/payouts/:id/execute` existait déjà, mais rien ne l'exposait :
 * il fallait connaître l'identifiant du retrait pour l'appeler. C'est le seul
 * geste qui manquait à cet écran — trouver le retrait, exécuter, sont
 * maintenant à un clic l'un de l'autre.
 */
export function ExecuteButton({ payoutId }: { payoutId: string }) {
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
        loadingLabel="Exécution…"
        onClick={async () => {
          setPending(true);
          setError(null);

          try {
            const response = await fetch(`/api/admin/payouts/${payoutId}/execute`, {
              method: 'POST',
            });
            const payload = (await response.json()) as { message?: string };

            if (!response.ok) {
              setError(payload.message ?? 'Le versement a échoué.');
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
        Exécuter
      </Button>
    </div>
  );
}
