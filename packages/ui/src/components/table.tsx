import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Table de données — densité professionnelle.
 *
 * Valeurs du prototype : en-tête sur fond papier, caption 11 px majuscules,
 * lignes séparées par `border-subtle`, survol `surface-alt`, colonnes
 * numériques alignées à droite en tabulaire, pied sur fond papier.
 *
 * ⚠️ Comportement responsive imposé : « Sur mobile, cette table devient une
 * pile de cartes. Aucun défilement horizontal. » Les écrans doivent donc
 * monter `Table` au-dessus de 768 px et une liste de cartes en dessous —
 * pas masquer l'une des deux en CSS.
 */

export function Table({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('overflow-hidden rounded-card border border-border', className)}
      {...props}
    />
  );
}

export interface TableRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Gabarit de colonnes CSS, par exemple `1.5fr .8fr .6fr 40px`. */
  columns: string;
  variant?: 'head' | 'body' | 'muted';
}

export function TableRow({ columns, variant = 'body', className, style, ...props }: TableRowProps) {
  return (
    <div
      className={cn(
        'grid items-center gap-3',
        variant === 'head' &&
          'bg-paper px-3.5 py-2.5 text-caption font-bold uppercase tracking-[0.1em] text-text-2',
        variant === 'body' &&
          'border-t border-border-subtle px-3.5 py-3.5 text-body transition-colors duration-(--duration-hover) hover:bg-surface-alt',
        variant === 'muted' &&
          'border-t border-border-subtle bg-surface-alt px-3.5 py-3.5 text-body text-text-2',
        className,
      )}
      style={{ gridTemplateColumns: columns, ...style }}
      {...props}
    />
  );
}

/** Cellule numérique : alignée à droite, chiffres tabulaires. */
export function TableNumber({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('tabular text-right', className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border bg-paper px-3.5 py-3 text-body-s text-text-2',
        className,
      )}
      {...props}
    />
  );
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  const pages = buildPageList(page, totalPages);

  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1.5', className)}>
      <PageButton
        label="‹"
        ariaLabel="Page précédente"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      />
      {pages.map((value, index) =>
        value === null ? (
          <span key={`gap-${index}`} className="px-1 text-text-3">
            …
          </span>
        ) : (
          <PageButton
            key={value}
            label={String(value)}
            ariaLabel={`Page ${value}`}
            active={value === page}
            onClick={() => onPageChange(value)}
          />
        ),
      )}
      <PageButton
        label="›"
        ariaLabel="Page suivante"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      />
    </nav>
  );
}

function PageButton({
  label,
  ariaLabel,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-[30px] min-w-[30px] cursor-pointer rounded-[8px] px-2 text-body-s',
        active
          ? 'border-0 bg-ink font-bold text-white'
          : 'border border-border-field bg-surface hover:bg-paper',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-surface',
      )}
    >
      {label}
    </button>
  );
}

function buildPageList(page: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | null> = [1];
  if (page > 3) pages.push(null);

  for (let value = Math.max(2, page - 1); value <= Math.min(totalPages - 1, page + 1); value += 1) {
    pages.push(value);
  }

  if (page < totalPages - 2) pages.push(null);
  pages.push(totalPages);
  return pages;
}
