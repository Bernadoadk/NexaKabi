'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { Alert, Button, SuccessDialog } from '@nexakabi/ui';
import { publishEventAction } from '../../../actions';

/**
 * Publier depuis l'aperçu.
 *
 * Le bouton n'est actif que si la complétude le permet : la page vient de
 * dire ce qui manque, inutile de laisser cliquer pour l'entendre une seconde
 * fois. En cas de succès, la même confirmation que dans l'assistant.
 */
export function PublishBar({
  organizationId,
  eventId,
  disabled,
}: {
  organizationId: string;
  eventId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="compact"
        disabled={disabled}
        loading={pending}
        loadingLabel="Publication…"
        title={disabled ? 'Complète d’abord les points listés ci-dessous.' : undefined}
        onClick={async () => {
          setPending(true);
          setError(null);

          const result = await publishEventAction(organizationId, eventId);
          setPending(false);

          if (!result.ok) {
            setError(result.message);
            return;
          }

          if (result.data.missing.length > 0) {
            setError(`Il reste à compléter : ${result.data.missing.join(' · ')}`);
            router.refresh();
            return;
          }

          setDone(true);
          router.refresh();
        }}
      >
        <Rocket className="size-4" aria-hidden />
        Publier
      </Button>

      {error ? (
        <div className="basis-full">
          <Alert tone="danger" title="Publication impossible">
            {error}
          </Alert>
        </div>
      ) : null}

      <SuccessDialog
        open={done}
        onOpenChange={setDone}
        title="Événement publié"
        description="Il est désormais visible dans la découverte, et la billetterie est ouverte."
      >
        <Button variant="primary" size="mobile" block onClick={() => router.push('/pro/evenements')}>
          Voir mes événements →
        </Button>
      </SuccessDialog>
    </>
  );
}
