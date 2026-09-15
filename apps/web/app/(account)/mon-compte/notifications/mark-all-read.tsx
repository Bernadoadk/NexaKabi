'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';

/**
 * « Tout lire ✓ » du prototype.
 *
 * Optimiste par nécessité : l'appel prend une seconde sur un réseau béninois, et
 * un bouton qui reste inerte pendant ce temps se fait cliquer trois fois. Le
 * bouton disparaît dès le clic, et `router.refresh()` reconstruit la liste.
 *
 * Si l'appel échoue, le rafraîchissement ramènera les alertes non lues telles
 * qu'elles sont : rien n'est perdu, l'écran redit simplement la vérité.
 */
export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);

        void fetch('/api/notifications/lues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
          .catch(() => undefined)
          .finally(() => {
            router.refresh();
            setPending(false);
          });
      }}
      className="inline-flex min-h-[var(--tap-min)] items-center gap-1.5 px-1 text-body-s font-semibold text-text-2 transition hover:text-text-strong disabled:opacity-50"
    >
      Tout lire
      <CheckCheck aria-hidden className="size-4" />
    </button>
  );
}
