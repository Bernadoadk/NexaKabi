'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/cn';

/**
 * Navigation secondaire d'une console (admin, espace organisateur, compte).
 *
 * Trois implémentations quasi identiques existaient déjà (nav admin, onglets
 * d'un événement, nav du compte participant) : même style de soulignement,
 * même calcul d'état actif, copiées à la main à chaque fois. Ce composant les
 * unifie sans changer le rendu visuel — c'est une extraction, pas une
 * redesign.
 *
 * Ce sont des liens de navigation entre PAGES, pas des onglets ARIA qui
 * changeraient un panneau sur place : `role="tablist"` serait donc un mauvais
 * choix sémantique ici, volontairement évité.
 */
export interface SectionNavEntry {
  href: string;
  label: string;
  /** `true` : correspondance exacte du chemin. `false` (défaut) : préfixe. */
  exact?: boolean;
}

export interface SectionNavProps {
  entries: readonly SectionNavEntry[];
  /** Libellé d'accessibilité de la zone de navigation, ex. « Administration ». */
  ariaLabel: string;
  /** Largeur maximale du conteneur, alignée sur celle de `ConsoleShell`. */
  maxWidthClassName?: string;
  className?: string;
}

export function SectionNav({
  entries,
  ariaLabel,
  maxWidthClassName = 'max-w-[1180px]',
  className,
}: SectionNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn('mx-auto px-5', maxWidthClassName, className)} aria-label={ariaLabel}>
      <ul className="flex gap-1 overflow-x-auto">
        {entries.map((entry) => {
          const active = entry.exact ? pathname === entry.href : pathname.startsWith(entry.href);

          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[var(--tap-min)] items-center whitespace-nowrap border-b-2 px-3 text-body-s transition',
                  active
                    ? 'border-coral font-bold text-text-strong'
                    : 'border-transparent font-semibold text-text-2 hover:text-text-strong',
                )}
              >
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
