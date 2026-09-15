'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Cercle d'initiales.
 *
 * Généralise un motif qui existait déjà, codé en dur, dans l'équipe de
 * l'organisateur (`bg-ink text-white`, deux lettres) — repris ici tel quel
 * plutôt que réinventé, pour que le premier endroit continue d'avoir
 * exactement le même rendu le jour où il est basculé sur ce composant.
 *
 * Fond encre volontairement invariable : comme tout `bg-ink`, ce n'est pas une
 * surface de page qui doit réagir au thème, c'est un repère de marque.
 */
const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-bold text-white',
  {
    variants: {
      size: {
        compact: 'size-7 text-[11px]',
        default: 'size-[34px] text-[12px]',
        large: 'size-11 text-[15px]',
        xl: 'size-16 text-[20px]',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof avatarVariants> {
  /** Nom complet, réduit à ses deux premières initiales. */
  name: string;
  /** Photo de profil. Absente ou en échec de chargement : repli sur les initiales. */
  src?: string | null;
}

export function Avatar({ name, src, size, className, ...props }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);

  return (
    <span
      className={cn(avatarVariants({ size }), src && !failed ? 'bg-transparent p-0' : '', className)}
      aria-hidden="true"
      {...props}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="size-full rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export { avatarVariants };
