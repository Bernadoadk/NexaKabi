'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, startRouteProgress } from '@nexakabi/ui';
import { acceptInvitationAction } from '@/app/(pro)/pro/actions';

/**
 * @param destination où aller une fois membre. Un contrôleur n'a rien à faire
 *        dans l'espace organisateur — il vient scanner, et c'est le scanner
 *        qu'il doit voir en premier. Les autres rôles rejoignent l'espace pro.
 */
export function AcceptInvitationButton({
  token,
  destination = '/pro',
}: {
  token: string;
  destination?: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <div className="flex flex-col gap-2.5">
      {error ? (
        <Alert tone="danger" title="Impossible d’accepter">
          {error}
        </Alert>
      ) : null}

      <Button
        variant="primary"
        size="primary"
        block
        loading={pending}
        loadingLabel="Acceptation…"
        onClick={async () => {
          setPending(true);
          setError(null);

          const result = await acceptInvitationAction(token);
          setPending(false);

          if (!result.ok) {
            setError(result.message);
            return;
          }

          // Le bouton vient de rendre la main, et la destination — espace
          // organisateur ou scanner — est un espace entier qui se monte.
          startRouteProgress();
          router.replace(destination);
          router.refresh();
        }}
      >
        Rejoindre l’équipe
      </Button>
    </div>
  );
}
