'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Surface, Textarea } from '@nexakabi/ui';

/**
 * Geler ou dégeler les fonds d'une organisation, directement depuis sa fiche.
 *
 * `POST /admin/organizations/:id/freeze` avait déjà un écran (dans le détail
 * d'un signalement, `signalements/[id]/case-actions.tsx`) — mais `unfreeze`
 * n'en avait AUCUN : un gel posé ne pouvait être levé qu'en appelant l'API à
 * la main. La fiche de l'organisation le comble, et devient le seul endroit
 * qui rassemble les deux gestes.
 */
export function FreezeActions({
  organizationId,
  frozen,
}: {
  organizationId: string;
  frozen: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [reason, setReason] = React.useState('');

  async function call(path: 'freeze' | 'unfreeze', motive: string) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/organizations/${organizationId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: motive }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'L’action a échoué.');
        return;
      }

      setConfirming(false);
      setReason('');
      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
      <h2 className="text-h3 font-bold">Fonds</h2>

      {error ? (
        <Alert tone="danger" title="Action impossible">
          {error}
        </Alert>
      ) : null}

      {!confirming ? (
        <>
          <p className="text-body-s leading-relaxed text-text-2">
            {frozen
              ? 'Les retraits de cette organisation sont actuellement suspendus.'
              : 'Le gel empêche tout versement, y compris les fonds qui se débloqueraient plus tard. Il est réversible.'}
          </p>
          <Button
            type="button"
            variant={frozen ? 'primary' : 'secondary'}
            size="default"
            block
            onClick={() => setConfirming(true)}
          >
            {frozen ? 'Lever le gel' : 'Geler les fonds'}
          </Button>
        </>
      ) : (
        <>
          <Alert
            tone={frozen ? 'info' : 'warning'}
            title={frozen ? 'Lever le gel' : 'Ceci immobilise de l’argent'}
          >
            {frozen
              ? 'L’organisateur retrouvera l’accès à ses retraits.'
              : 'L’organisateur ne pourra plus rien retirer tant que le gel dure.'}{' '}
            Le motif ci-dessous lui sera visible.
          </Alert>

          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              frozen
                ? 'Ex. Dossier instruit, aucune anomalie confirmée.'
                : 'Ex. Signalement pour événement inexistant, en cours de vérification auprès de la salle.'
            }
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="default"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                setReason('');
              }}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="primary"
              size="default"
              loading={pending}
              disabled={reason.trim().length < 10}
              onClick={() => void call(frozen ? 'unfreeze' : 'freeze', reason.trim())}
            >
              Confirmer
            </Button>
          </div>
        </>
      )}
    </Surface>
  );
}
