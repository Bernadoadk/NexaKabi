'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Surface, Textarea } from '@nexakabi/ui';

/**
 * Suspendre ou réactiver un compte.
 *
 * Réversible par construction, comme le gel de fonds : suspendre coupe
 * l'accès (`SessionGuard` vérifie déjà `status !== 'SUSPENDED'`), rien
 * d'autre n'est touché. Réservé aux comptes `USER` — un administrateur ou un
 * support ne se suspend pas depuis cet écran, l'API le refuse de toute façon.
 */
export function SuspendActions({
  userId,
  status,
  canModerate,
}: {
  userId: string;
  status: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [reason, setReason] = React.useState('');

  if (!canModerate) return null;

  const suspended = status === 'SUSPENDED';

  async function reactivate() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}/reactivate`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'L’action a échoué.');
        return;
      }

      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  async function suspend() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
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
      <h2 className="text-h3 font-bold">Accès au compte</h2>

      {error ? (
        <Alert tone="danger" title="Action impossible">
          {error}
        </Alert>
      ) : null}

      {suspended ? (
        <>
          <p className="text-body-s leading-relaxed text-text-2">
            Ce compte ne peut plus se connecter. Le reste — organisations, billets, historique —
            reste intact.
          </p>
          <Button
            type="button"
            variant="primary"
            size="default"
            loading={pending}
            onClick={() => void reactivate()}
          >
            Réactiver le compte
          </Button>
        </>
      ) : !confirming ? (
        <>
          <p className="text-body-s leading-relaxed text-text-2">
            Suspendre bloque la connexion immédiatement. C’est réversible.
          </p>
          <Button
            type="button"
            variant="destructive"
            size="default"
            onClick={() => setConfirming(true)}
          >
            Suspendre le compte
          </Button>
        </>
      ) : (
        <>
          <Alert tone="warning" title="Le compte sera bloqué immédiatement">
            Le motif est consultable dans le journal d’audit.
          </Alert>
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex. Signalements multiples pour fraude, en cours d’instruction."
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
              variant="destructive-solid"
              size="default"
              loading={pending}
              disabled={reason.trim().length < 10}
              onClick={() => void suspend()}
            >
              Confirmer
            </Button>
          </div>
        </>
      )}
    </Surface>
  );
}
