'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Bouton.
 *
 * Neuf variantes relevées dans le prototype de référence. Deux règles
 * structurantes, à faire respecter en revue de code :
 *
 *  1. Un seul bouton `primary` par zone de décision. Deux boutons corail
 *     visibles ensemble signalent une hiérarchie ratée.
 *  2. Le corail porte un texte ENCRE, jamais blanc : contraste plus élevé et
 *     rendu moins « bouton web générique ».
 *
 * Hauteur tactile minimale : 44 px partout, 48 px sur les surfaces mobiles,
 * 52 px pour une action primaire mobile. Aucune largeur fixe : le français
 * allonge les libellés de 15 à 25 %.
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 rounded-button font-sans',
    'transition-colors duration-(--duration-hover)',
    'disabled:pointer-events-none disabled:bg-fill-muted disabled:text-text-disabled disabled:border-transparent',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-strong',
  ),
  {
    variants: {
      variant: {
        /** Action principale. Le texte est encre, jamais blanc. */
        primary: 'bg-coral text-ink font-bold border-0 hover:bg-coral-hover',
        /** Action forte non commerciale : publier, envoyer, enregistrer. */
        ink: 'bg-ink text-white font-bold border-0 hover:bg-ink-700',
        /** Action secondaire. */
        secondary:
          'bg-surface text-text-strong font-semibold border border-border-field hover:bg-paper',
        /** Action tertiaire, sans surface. */
        tertiary: 'bg-transparent text-text-2 font-semibold border-0 hover:text-text-strong',
        /** Action destructive, premier niveau — proposée, pas encore confirmée. */
        destructive: 'bg-red-50 text-red-700 font-semibold border border-red-200 hover:bg-red-100',
        /** Action destructive confirmée, dans un dialogue. */
        'destructive-solid': 'bg-red text-white font-bold border-0 hover:bg-red-700',
        /** Bouton posé sur un fond encre. */
        'on-ink': 'bg-white/10 text-white font-semibold border-0 hover:bg-white/20',
      },
      size: {
        /** 44 px — plancher tactile, valeur par défaut. */
        default: 'min-h-[var(--tap-min)] px-[18px] py-[11px] text-body',
        /** 48 px — surfaces mobiles. */
        mobile: 'min-h-[var(--tap-mobile)] px-4 py-3 text-body',
        /** 52 px — action primaire mobile, pleine largeur. */
        primary: 'min-h-[var(--tap-primary)] px-[26px] py-[14px] text-[15px]',
        /** 56 px — verdict de scan, une main, à bout de bras. */
        scan: 'min-h-[var(--tap-large)] px-4 py-4 text-[15px]',
        /** Compact, réservé aux barres d'outils denses de l'espace pro. */
        compact: 'min-h-[var(--tap-min)] px-[14px] py-[9px] text-body-s',
        /** Carré 44×44, pour une icône seule. */
        icon: 'size-[var(--tap-min)] p-0 text-[15px]',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Rend l'élément enfant au lieu d'un `<button>` (pour un lien, par exemple). */
  asChild?: boolean;
  /**
   * Affiche l'état de traitement. Le bouton reste visible et conserve sa
   * largeur : le prototype montre un fond corail atténué et un curseur
   * `progress`, jamais un bouton qui disparaît.
   */
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    asChild = false,
    loading = false,
    loadingLabel = 'Traitement…',
    disabled,
    children,
    ...props
  },
  ref,
) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      ref={ref}
      className={cn(
        buttonVariants({ variant, size, block }),
        // L'état de traitement n'utilise PAS `disabled` : le prototype montre un
        // bouton corail atténué avec un curseur `progress`, pas un bouton grisé.
        loading && 'cursor-progress bg-coral-200 text-ink hover:bg-coral-200',
        className,
      )}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? preventClick : props.onClick}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </Component>
  );
});

function preventClick(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[13px] shrink-0 rounded-full border-2 border-ink/30 border-t-ink animate-nk-spin"
    />
  );
}

export { buttonVariants };
