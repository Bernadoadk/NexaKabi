'use client';

import { useRouter } from 'next/navigation';
import { cn, startRouteProgress } from '@nexakabi/ui';

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        // Le filet part au clic, pas au `replace` : la déconnexion attend
        // d'abord l'API, et ce lien discret n'a pas d'état d'attente à lui.
        startRouteProgress();

        void fetch('/api/admin/auth/logout', { method: 'POST' })
          .catch(() => undefined)
          .finally(() => {
            router.replace('/connexion');
            router.refresh();
          });
      }}
      className={cn(
        'inline-flex min-h-[var(--tap-min)] items-center px-2 text-body-s font-semibold text-text-2 transition hover:text-text-strong',
        className,
      )}
    >
      Fermer la session
    </button>
  );
}
