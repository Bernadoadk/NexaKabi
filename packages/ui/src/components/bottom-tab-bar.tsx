'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/cn';

/**
 * Barre d'onglets basse — la navigation mobile du prototype.
 *
 * ── Ce que le prototype impose ──────────────────────────────────────────────
 * « Barre basse à 5 onglets, pas de hamburger : les destinations réelles sont
 * peu nombreuses et doivent être atteignables au pouce. » Valeurs relevées :
 * fond surface, filet supérieur, colonnes de 56 px minimum, icône 17 px,
 * libellé 10 px, corail gras pour l'onglet actif, `text-3` pour les autres.
 *
 * ── Ce que ce composant ajoute au prototype ─────────────────────────────────
 * Le dégagement de la zone de geste système (`safe-area-inset-bottom`) : sur
 * un iPhone sans bouton, une barre collée au bord tombe sous la ligne
 * d'accueil et devient intouchable. Et une pastille de compte pour les
 * alertes non lues, jamais portée par la couleur seule.
 *
 * Masquée à partir du palier `md` : au-dessus, la navigation vit dans
 * l'en-tête. Les pages qui l'affichent réservent l'espace en bas
 * (`pb-[calc(…)]`) pour que rien ne se cache derrière.
 */
export interface BottomTabEntry {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** `true` : correspondance exacte du chemin. Défaut : préfixe. */
  exact?: boolean;
  /** Compteur affiché en pastille, ex. alertes non lues. `0` n'affiche rien. */
  badge?: number;
  /** Chemins supplémentaires qui activent cet onglet, ex. `/e/` pour « Découvrir ». */
  alsoActiveOn?: readonly string[];
}

export interface BottomTabBarProps extends React.HTMLAttributes<HTMLElement> {
  entries: readonly BottomTabEntry[];
  ariaLabel: string;
  /**
   * Préfixes de chemin où la barre s'efface — la page événement et le tunnel
   * d'achat ont leur propre barre basse (prix + « Obtenir un billet »), qui
   * doit rester seule à l'écran.
   */
  hiddenOn?: readonly string[];
  className?: string;
}

/** Hauteur de la barre, hors zone système — à réserver en bas des pages. */
export const BOTTOM_TAB_BAR_HEIGHT = 62;

export function BottomTabBar({
  entries,
  ariaLabel,
  hiddenOn,
  className,
  ...props
}: BottomTabBarProps) {
  const pathname = usePathname();

  if (hiddenOn?.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden',
        'pb-[env(safe-area-inset-bottom)]',
        className,
      )}
      {...props}
    >
      <ul className="flex items-stretch justify-around px-2 pb-2 pt-[9px]">
        {entries.map((entry) => {
          const active =
            (entry.exact ? pathname === entry.href : pathname.startsWith(entry.href)) ||
            (entry.alsoActiveOn?.some((prefix) => pathname.startsWith(prefix)) ?? false);

          return (
            <li key={entry.href} className="min-w-[56px] flex-1">
              <Link
                href={entry.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[44px] flex-col items-center justify-center gap-[3px] rounded-[10px] px-1 transition-colors',
                  active ? 'text-coral' : 'text-text-3 hover:text-text-2',
                )}
              >
                <span
                  className={cn(
                    'relative flex size-[22px] items-center justify-center [&>svg]:size-[19px]',
                    active && '[&>svg]:stroke-[2.4]',
                  )}
                >
                  {entry.icon}
                  {entry.badge ? (
                    <span
                      aria-label={`${entry.badge} non lue${entry.badge > 1 ? 's' : ''}`}
                      className="absolute -right-2 -top-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-coral px-1 text-[9.5px] font-bold leading-none text-ink"
                    >
                      {entry.badge > 9 ? '9+' : entry.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'text-[10px] leading-none tracking-[0.01em]',
                    active ? 'font-bold' : 'font-semibold',
                  )}
                >
                  {entry.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
