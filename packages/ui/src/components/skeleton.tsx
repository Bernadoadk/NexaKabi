import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Squelette de chargement.
 *
 * Règle du prototype : « Le squelette reprend exactement la géométrie finale —
 * aucun décalage à l'arrivée des données. Jamais de spinner plein écran sur
 * une liste. »
 *
 * L'animation est décalée de 0,15 s par élément pour éviter le clignotement
 * synchrone d'un bloc entier.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rang de l'élément dans le bloc, pour décaler l'animation. */
  index?: number;
}

export function Skeleton({ className, index = 0, style, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-[5px] bg-fill-muted animate-nk-pulse', className)}
      style={{ animationDelay: `${index * 0.15}s`, ...style }}
      {...props}
    />
  );
}

/** Squelette d'une carte d'événement standard, à la géométrie exacte. */
export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border-subtle">
      <Skeleton className="h-24 rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-[9px] w-[45%]" index={0} />
        <Skeleton className="h-[13px] w-[85%]" index={1} />
        <Skeleton className="h-[9px] w-[60%]" index={2} />
      </div>
    </div>
  );
}

/** Squelette d'une ligne horizontale (liste mobile, recommandations). */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border-subtle p-3">
      <Skeleton className="size-14 shrink-0 rounded-field" index={1} />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-[11px] w-[70%]" index={0} />
        <Skeleton className="h-[9px] w-[40%]" index={2} />
      </div>
    </div>
  );
}
