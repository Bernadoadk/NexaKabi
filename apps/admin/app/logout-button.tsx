'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@nexakabi/ui';

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
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
