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
 *
 * ── Le défilement, sur un écran étroit ──────────────────────────────────────
 * Neuf entrées ne tiennent pas dans 390 px : la barre défile. Deux règles la
 * rendent supportable au doigt, et leur absence était un vrai défaut d'usage
 * de la console d'administration.
 *
 * `overscroll-x-contain` : arrivé au dernier onglet, le geste s'arrête là.
 * Sans lui, il se poursuit sur la page entière, qui part de côté — on croit
 * avoir cassé l'écran alors qu'on voulait seulement choisir un onglet.
 *
 * Ascenseur masqué, et retrait porté par la liste plutôt que par la barre :
 * la zone qui défile va ainsi d'un bord à l'autre, et les onglets glissent
 * SOUS le bord au lieu de s'arrêter net dans une gouttière.
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
  /**
   * Où la barre est posée.
   *
   * `header` — dans l'en-tête de `ConsoleShell`, qui n'a pas de conteneur
   * centré : la barre se centre elle-même. `inline` — dans le corps d'une
   * page, à l'intérieur du `<main>`, qui a déjà son retrait : la barre
   * l'annule pour aller d'un bord à l'autre. Sans ce second cas, chaque
   * appelant recopiait un `px-0` ou héritait d'un retrait doublé.
   */
  variant?: 'header' | 'inline';
  /** Largeur maximale du conteneur, alignée sur celle de `ConsoleShell`. */
  maxWidthClassName?: string;
  className?: string;
}

export function SectionNav({
  entries,
  ariaLabel,
  variant = 'header',
  maxWidthClassName = 'max-w-[1180px]',
  className,
}: SectionNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        variant === 'header' ? cn('mx-auto', maxWidthClassName) : '-mx-4 sm:-mx-5',
        className,
      )}
      aria-label={ariaLabel}
    >
      <ul className="flex gap-1 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden">
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
