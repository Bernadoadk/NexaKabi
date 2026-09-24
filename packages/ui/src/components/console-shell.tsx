import Link from 'next/link';
import { cn } from '../lib/cn';
import { BottomTabBar, type BottomTabEntry } from './bottom-tab-bar';
import { BrandMark } from './brand-mark';
import { ConsoleMobileMenu, type ConsoleMobileMenuProps } from './console-mobile';

/**
 * Cadre commun d'une console (administration, espace organisateur).
 *
 * Généralise `AdminShell`, qui existait déjà mais était câblé en dur pour
 * l'administration. Même en-tête sticky, même bandeau de navigation, même
 * corps centré — paramétrés au lieu d'être recopiés.
 *
 * ── Mobile ──────────────────────────────────────────────────────────────────
 * Le prototype fixe la règle : « sidebar en tiroir, actions clés en barre
 * basse ». Sous le palier `md`, l'en-tête ne garde que la marque, un ou deux
 * raccourcis (`mobileHeaderEnd`, typiquement les alertes) et le bouton du
 * tiroir ; le bandeau de navigation secondaire disparaît au profit de la
 * barre basse (`mobileTabs`). Tout ce que l'en-tête desktop affichait — nom
 * de l'organisation, thème, sortie — se retrouve dans le tiroir.
 *
 * Sans `mobileTabs` ni `mobileMenu`, le rendu est celui d'avant : bandeau
 * défilant et en-tête complet. Les consoles adoptent le mobile une à une.
 */
export interface ConsoleShellProps {
  /** Où mène le logo. */
  brandHref?: string;
  brandLabel: string;
  /** Contenu de droite dans l'en-tête, palier `md` et au-delà. */
  headerEnd?: React.ReactNode;
  /** Raccourcis de l'en-tête mobile, à gauche du bouton de menu. */
  mobileHeaderEnd?: React.ReactNode;
  /** Le tiroir mobile : ce qu'il affiche, et son bouton. */
  mobileMenu?: ConsoleMobileMenuProps;
  /** Les cinq destinations de la barre basse mobile. */
  mobileTabs?: readonly BottomTabEntry[];
  /** La navigation secondaire, ex. `<SectionNav … />`. */
  nav: React.ReactNode;
  maxWidthClassName?: string;
  children: React.ReactNode;
}

export function ConsoleShell({
  brandHref = '/',
  brandLabel,
  headerEnd,
  mobileHeaderEnd,
  mobileMenu,
  mobileTabs,
  nav,
  maxWidthClassName = 'max-w-[1180px]',
  children,
}: ConsoleShellProps) {
  const hasMobileChrome = Boolean(mobileMenu || mobileTabs);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div
          className={cn(
            'mx-auto flex h-[58px] items-center gap-3 px-4 sm:gap-4 sm:px-5',
            maxWidthClassName,
          )}
        >
          {/* `text-text-strong` explicite : la feuille globale colore les liens en corail. */}
          <Link
            href={brandHref}
            className="flex min-w-0 shrink items-center gap-1 text-text-strong"
          >
            <BrandMark size={34} />
            <span className="truncate font-display text-[16px] font-bold tracking-[-0.02em]">
              {brandLabel}
            </span>
          </Link>

          <div className="flex-1" />

          {headerEnd ? (
            <div className={cn('items-center gap-3', hasMobileChrome ? 'hidden md:flex' : 'flex')}>
              {headerEnd}
            </div>
          ) : null}

          {hasMobileChrome ? (
            <div className="flex items-center gap-1 md:hidden">
              {mobileHeaderEnd}
              {mobileMenu ? <ConsoleMobileMenu {...mobileMenu} /> : null}
            </div>
          ) : null}
        </div>

        <div className={cn(mobileTabs ? 'hidden md:block' : undefined)}>{nav}</div>
      </header>

      <main
        className={cn(
          'mx-auto w-full flex-1 px-4 pt-5 sm:px-5 sm:pt-6',
          mobileTabs ? 'pb-[calc(env(safe-area-inset-bottom)+88px)] md:pb-16' : 'pb-16',
          maxWidthClassName,
        )}
      >
        {children}
      </main>

      {mobileTabs ? <BottomTabBar entries={mobileTabs} ariaLabel={brandLabel} /> : null}
    </div>
  );
}
