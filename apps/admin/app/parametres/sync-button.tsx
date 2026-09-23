'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ProviderSyncResult } from '@nexakabi/contracts';
import { Alert, Button } from '@nexakabi/ui';

/**
 * Relire chez le prestataire ce que le compte marchand sait faire.
 *
 * Le résultat dit combien de lignes ont été mises à jour, et surtout quels
 * moyens le prestataire annonce SANS qu'une ligne les configure chez nous :
 * c'est la liste de ce qu'on pourrait ouvrir, pays par pays.
 */
export function SyncButton({ providerCode }: { providerCode: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ProviderSyncResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
      <Button
        type="button"
        variant="secondary"
        size="compact"
        loading={pending}
        loadingLabel="Synchronisation…"
        onClick={async () => {
          setPending(true);
          setError(null);
          setResult(null);

          try {
            const response = await fetch(`/api/admin/settings/providers/${providerCode}/sync`, {
              method: 'POST',
            });
            const payload = (await response.json()) as ProviderSyncResult & { message?: string };

            if (!response.ok) {
              setError(payload.message ?? 'La synchronisation a échoué.');
              return;
            }

            setResult(payload);
            router.refresh();
          } catch {
            setError('L’API n’est pas joignable.');
          } finally {
            setPending(false);
          }
        }}
      >
        Synchroniser
      </Button>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {result ? (
        <Alert tone={result.unknown.length > 0 ? 'info' : 'success'} title="Synchronisation faite">
          {result.updated} ligne(s) mise(s) à jour.
          {result.unknown.length > 0 ? (
            <>
              {' '}
              Le prestataire annonce aussi :{' '}
              {result.unknown
                .map(
                  (entry) =>
                    `${entry.providerMethodCode} (${entry.countryCode}${entry.collection ? ' · collecte' : ''}${entry.payout ? ' · versement' : ''})`,
                )
                .join(', ')}
              . Ajoute-les au pays concerné pour les proposer.
            </>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
