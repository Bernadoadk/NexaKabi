import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Surfaces : carte, panneau et bloc immersif.
 *
 * Le prototype associe un rayon à chaque niveau — 14 carte, 18 panneau,
 * 24 bloc — et n'élève une surface qu'au survol (120 ms).
 */
const surfaceVariants = cva('', {
  variants: {
    variant: {
      /** Carte standard sur fond papier. */
      card: 'bg-surface border border-border rounded-card',
      /** Panneau de section, plus grand rayon. */
      panel: 'bg-surface border border-border rounded-panel',
      /** Bloc immersif encre : hero, mise en avant, verdict. */
      ink: 'bg-ink text-white rounded-block',
      /** Encadré discret, sur fond papier. */
      muted: 'bg-paper rounded-card',
      /** Surface alternée : pied de carte, ligne inactive. */
      alt: 'bg-surface-alt border border-border rounded-panel',
    },
    padding: {
      none: 'p-0',
      /** 12 px — carte compacte. */
      compact: 'p-3',
      /** 20 px — panneau de dashboard. */
      default: 'p-5',
      /** 24 px — carte standard. */
      comfortable: 'p-6',
      /** 34 px — bloc immersif. */
      spacious: 'px-[34px] py-8',
    },
    interactive: {
      true: 'transition-shadow duration-(--duration-hover) hover:shadow-md',
    },
  },
  defaultVariants: {
    variant: 'panel',
    padding: 'default',
  },
});

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof surfaceVariants> {
  asChild?: boolean;
}

export function Surface({ className, variant, padding, interactive, ...props }: SurfaceProps) {
  return (
    <div className={cn(surfaceVariants({ variant, padding, interactive }), className)} {...props} />
  );
}

/** En-tête de panneau, séparé du corps par une ligne fine. */
export function SurfaceHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-3 border-b border-border-subtle px-5 py-4', className)}
      {...props}
    />
  );
}

export function SurfaceTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-[15px] font-bold', className)} {...props} />;
}

export function SurfaceSubtitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-body-s text-text-2', className)} {...props} />;
}

/** Pied de panneau, sur surface alternée. */
export function SurfaceFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-border bg-paper px-5 py-4 text-body-s text-text-2',
        className,
      )}
      {...props}
    />
  );
}

export { surfaceVariants };
