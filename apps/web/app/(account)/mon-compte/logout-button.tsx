'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@nexakabi/ui';

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
        await fetch('/api/auth/logout', { method: 'POST' });
        router.replace('/');
        router.refresh();
      }}
    >
      <LogOut className="size-4" />
      Se déconnecter
    </Button>
  );
}
