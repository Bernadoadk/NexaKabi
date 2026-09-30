'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@nexakabi/ui';

/**
 * Désabonner une adresse — quand la personne le demande par un autre canal
 * (WhatsApp, téléphone) plutôt que par le lien de l'e-mail.
 *
 * En deux temps : le premier toucher arme, le second confirme. Le geste est
 * tracé au journal ; il ne se défait pas depuis la console — seule la
 * personne peut se réabonner, et confirmer de nouveau son adresse.
 */
export function UnsubscribeButton({
  subscriberId,
  email,
}: {
  subscriberId: string;
  email: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/newsletter/subscribers/${subscriberId}/unsubscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? 'Le désabonnement n’a pas pu être enregistré.');
        return;
      }

      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {armed ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            size="compact"
            loading={pending}
            loadingLabel="Désabonnement…"
            onClick={() => void confirm()}
            aria-label={`Confirmer le désabonnement de ${email}`}
          >
            Confirmer
          </Button>
          <Button type="button" variant="tertiary" size="compact" onClick={() => setArmed(false)}>
            Annuler
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="compact" onClick={() => setArmed(true)}>
          Désabonner
        </Button>
      )}
      {error ? (
        <span role="alert" className="text-micro font-semibold text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
