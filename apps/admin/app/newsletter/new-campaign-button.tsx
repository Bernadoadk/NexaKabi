'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button, startRouteProgress } from '@nexakabi/ui';

/**
 * Nouvelle campagne : un brouillon est créé tout de suite, puis ouvert.
 *
 * Plutôt qu'un formulaire vide à remplir avant d'exister : le brouillon est
 * enregistré dès le départ, et rien de ce qu'on y écrit ne se perd en
 * fermant l'onglet.
 */
export function NewCampaignButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);

    try {
      const month = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date());
      const response = await fetch('/api/admin/newsletter/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: `Les sorties de ${month}` }),
      });

      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;

      if (!response.ok || !payload?.id) {
        setError(payload?.message ?? 'Le brouillon n’a pas pu être créé.');
        return;
      }

      startRouteProgress();
      router.push(`/newsletter/campagnes/${payload.id}`);
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ink"
        loading={pending}
        loadingLabel="Création…"
        onClick={() => void create()}
      >
        <Plus className="size-4" aria-hidden />
        Nouvelle campagne
      </Button>
      {error ? (
        <span role="alert" className="text-micro font-semibold text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
