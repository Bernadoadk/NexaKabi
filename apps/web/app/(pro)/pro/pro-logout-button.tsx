'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@nexakabi/ui';

/**
 * Déconnexion, dans le chrome de la console — même traitement compact que
 * `apps/admin/app/logout-button.tsx`. Le bouton `variant="secondary"` de
 * `(account)/mon-compte/logout-button.tsx` reste réservé au corps de page : ici
 * c'est un élément d'en-tête, pas une action de contenu.
 *
 * `className` permet au tiroir mobile de lui donner une forme de bouton
 * pleine largeur, sans dupliquer la logique de sortie.
 */
export function ProLogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        void fetch('/api/auth/logout', { method: 'POST' })
          .catch(() => undefined)
          .finally(() => {
            router.replace('/');
            router.refresh();
          });
      }}
      className={cn(
        'inline-flex min-h-[var(--tap-min)] items-center px-2 text-body-s font-semibold text-text-2 transition hover:text-text-strong',
        className,
      )}
    >
      Se déconnecter
    </button>
  );
}
