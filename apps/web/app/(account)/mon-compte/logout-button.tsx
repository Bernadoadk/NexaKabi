'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button, startRouteProgress } from '@nexakabi/ui';
import { unsubscribeThisDevice } from '@/lib/push-client';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      variant="secondary"
      loading={pending}
      loadingLabel="Déconnexion…"
      onClick={async () => {
        setPending(true);
        // L'appareil cesse d'abord de recevoir les alertes du compte — tant
        // que la session existe encore pour le dire au serveur. Un téléphone
        // prêté ne doit pas continuer à les afficher.
        await unsubscribeThisDevice().catch(() => undefined);
        await fetch('/api/auth/logout', { method: 'POST' });

        // Le bouton a porté l'attente jusqu'ici ; le filet prend le relais
        // pour le retour à l'accueil, qui recharge tout l'espace public.
        startRouteProgress();
        router.replace('/');
        router.refresh();
      }}
    >
      <LogOut className="size-4" />
      Se déconnecter
    </Button>
  );
}
