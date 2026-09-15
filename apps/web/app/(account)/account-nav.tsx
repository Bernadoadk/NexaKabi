'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Home, Receipt, Ticket } from 'lucide-react';
import { cn } from '@nexakabi/ui';

/**
 * Navigation de l'espace participant.
 *
 * Quatre entrées, et c'est le plafond. Le prototype est explicite : un
 * participant vient chercher son billet, pas explorer un tableau de bord. Tout
 * ce qui s'ajoute ici éloigne du QR.
 *
 * « Alertes » est en dernier délibérément : c'est l'entrée qu'on consulte quand
 * on a reçu quelque chose, jamais celle qu'on vient chercher.
 */
const ENTRIES = [
  { href: '/mon-compte', label: 'Accueil', exact: true, icon: Home },
  // Libellés courts : avec « Mes billets » et « Mes commandes », la quatrième
  // entrée dépassait de l'écran en 375 px. La barre défile, mais un onglet
  // qu'on ne voit pas est un onglet qui n'existe pas.
  { href: '/mon-compte/billets', label: 'Billets', exact: false, icon: Ticket },
  { href: '/mon-compte/commandes', label: 'Commandes', exact: false, icon: Receipt },
  { href: '/mon-compte/notifications', label: 'Alertes', exact: false, icon: Bell },
] as const;

export function AccountNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="mx-auto max-w-[960px] px-4 sm:px-5" aria-label="Espace participant">
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ENTRIES.map(({ href, label, exact, icon: Icon }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          const showBadge = href === '/mon-compte/notifications' && unreadCount > 0;

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[var(--tap-min)] items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-body-s transition',
                  active
                    ? 'border-coral font-bold text-text-strong'
                    : 'border-transparent font-semibold text-text-2 hover:text-text-strong',
                )}
              >
                <Icon className="size-4" strokeWidth={active ? 2.5 : 2} />
                {label}
                {showBadge ? (
                  <span
                    aria-label={`${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`}
                    className="flex min-w-[17px] items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold leading-[17px] text-ink"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
