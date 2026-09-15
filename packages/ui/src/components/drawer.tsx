'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Tiroir de navigation mobile.
 *
 * ── Ce que le prototype demande ─────────────────────────────────────────────
 * « Mobile pro : sidebar en tiroir, actions clés en barre basse. » Le tiroir
 * porte ce que l'en-tête desktop affiche et que l'écran étroit ne peut plus
 * montrer : l'organisation active, les entrées de navigation, le thème, la
 * sortie. La barre basse (`BottomTabBar`) garde les cinq destinations qu'on
 * atteint au pouce ; le tiroir est le reste.
 *
 * ── Mécanique ───────────────────────────────────────────────────────────────
 * `@radix-ui/react-dialog` pour le focus, l'échappement et le verrouillage du
 * défilement — un tiroir est une modale, sémantiquement. Il glisse depuis la
 * droite : Radix le monte déjà visible, l'entrée est donc une TRANSITION
 * déclenchée une frame après l'ouverture (même mécanisme que `SuccessDialog`),
 * pas une des trois animations en boucle du prototype.
 */

/**
 * Transition appliquée une frame après le montage : Radix monte déjà visible.
 *
 * Un délai double la frame : `requestAnimationFrame` ne tourne pas dans un
 * onglet masqué (application passée en arrière-plan à l'instant du geste),
 * et un tiroir qui attendrait une frame qui ne vient jamais resterait hors
 * champ au retour.
 */
export function useEntered(open: boolean): boolean {
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }

    const frame = requestAnimationFrame(() => setEntered(true));
    const timer = window.setTimeout(() => setEntered(true), 50);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open]);

  return entered;
}

const DrawerContext = React.createContext<{ close: () => void } | null>(null);

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Titre accessible du tiroir, ex. « Menu ». Affiché en tête. */
  title: string;
  /** Bloc d'identité sous le titre : organisation, compte… */
  header?: React.ReactNode;
  children: React.ReactNode;
  /** Actions fixées en bas du tiroir : thème, déconnexion. */
  footer?: React.ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  header,
  children,
  footer,
  className,
}: DrawerProps) {
  const entered = useEntered(open);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-ink/50 transition-opacity duration-200',
            entered ? 'opacity-100' : 'opacity-0',
          )}
        />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-[min(320px,86vw)] flex-col bg-surface shadow-lg focus:outline-none',
            'transition-transform duration-200 ease-out',
            entered ? 'translate-x-0' : 'translate-x-full',
            className,
          )}
        >
          <div className="flex items-center gap-3 border-b border-border px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
            <RadixDialog.Title className="font-display text-[17px] font-bold tracking-[-0.01em]">
              {title}
            </RadixDialog.Title>
            <div className="flex-1" />
            <RadixDialog.Close
              aria-label="Fermer le menu"
              className="flex size-[var(--tap-min)] items-center justify-center rounded-full text-text-2 transition hover:bg-surface-alt hover:text-text-strong"
            >
              <X className="size-5" />
            </RadixDialog.Close>
          </div>

          {header ? <div className="border-b border-border-subtle px-4 py-3.5">{header}</div> : null}

          <DrawerContext.Provider value={{ close }}>
            <div className="flex-1 overflow-y-auto px-2 py-2">{children}</div>
          </DrawerContext.Provider>

          {footer ? (
            <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)]">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export interface DrawerNavLinkProps {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** `true` : correspondance exacte du chemin. Défaut : préfixe. */
  exact?: boolean;
  /** Ligne secondaire, ex. le nombre d'alertes non lues. */
  detail?: React.ReactNode;
  /** Un lien sortant de l'espace courant, affiché en retrait — « Espace participant ». */
  muted?: boolean;
}

/** Ligne de navigation du tiroir. Le clic ferme le tiroir : on navigue, on ne reste pas. */
export function DrawerNavLink({ href, label, icon, exact, detail, muted }: DrawerNavLinkProps) {
  const pathname = usePathname();
  const context = React.useContext(DrawerContext);
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={() => context?.close()}
      className={cn(
        'flex min-h-[var(--tap-mobile)] items-center gap-3 rounded-field px-3 text-body transition-colors',
        active
          ? 'bg-paper font-bold text-text-strong'
          : muted
            ? 'font-medium text-text-2 hover:bg-paper hover:text-text-strong'
            : 'font-semibold text-text-strong hover:bg-paper',
      )}
    >
      {icon ? (
        <span
          className={cn(
            'flex size-[22px] items-center justify-center [&>svg]:size-[19px]',
            active ? 'text-coral' : 'text-text-3',
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex-1">{label}</span>
      {detail ? <span className="text-body-s text-text-3">{detail}</span> : null}
    </Link>
  );
}

/** Sous-titre de groupe dans le tiroir. */
export function DrawerSection({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow mt-3 mb-1 px-3 text-text-3">{children}</p>;
}

export interface MobileMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Pastille : une alerte non lue rend le menu « à voir ». */
  dot?: boolean;
}

/** Bouton d'ouverture, 44 px, réservé aux paliers sous `md`. */
export const MobileMenuButton = React.forwardRef<HTMLButtonElement, MobileMenuButtonProps>(
  function MobileMenuButton({ className, dot = false, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="Ouvrir le menu"
        className={cn(
          'relative flex size-[var(--tap-min)] items-center justify-center rounded-full text-text-strong transition hover:bg-surface-alt md:hidden',
          className,
        )}
        {...props}
      >
        <Menu className="size-[22px]" />
        {dot ? (
          <span
            aria-hidden
            className="absolute right-2 top-2 size-[7px] rounded-full bg-coral ring-2 ring-surface"
          />
        ) : null}
      </button>
    );
  },
);
