import * as React from 'react';
import { cn } from '../lib/cn';
import { Money } from './money';
import { formatDateChip } from '@nexakabi/utils';

/**
 * Tuile de statistique des tableaux de bord.
 *
 * Valeurs du prototype : sur-titre 10,5 px majuscules en `text-3`, valeur en
 * Bricolage 24 px tabulaire, complément en 11 px.
 * La variante `ink` marque la tuile la plus importante d'une rangée — le solde
 * disponible, par exemple.
 */
export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  /** Valeur déjà formatée. Pour un montant, préférer `amount`. */
  value?: React.ReactNode;
  /** Montant en unité entière : formaté et aligné automatiquement. */
  amount?: number;
  hint?: React.ReactNode;
  tone?: 'default' | 'ink' | 'warning' | 'success';
}

export function Stat({
  label,
  value,
  amount,
  hint,
  tone = 'default',
  className,
  ...props
}: StatProps) {
  const isInk = tone === 'ink';

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-[16px] p-[18px]',
        isInk ? 'bg-ink text-white' : 'border border-border bg-surface',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'text-[10.5px] font-bold uppercase tracking-[0.12em]',
          isInk ? 'text-coral-300' : 'text-text-3',
        )}
      >
        {label}
      </div>

      <div
        className={cn(
          'tabular font-display text-[24px] font-bold',
          tone === 'warning' && 'text-amber-600',
          tone === 'success' && 'text-mint-700',
        )}
      >
        {amount !== undefined ? <Money amount={amount} size="medium" hideSymbol /> : value}
      </div>

      {hint ? (
        <div className={cn('text-[11px]', isInk ? 'text-on-ink-2' : 'text-text-2')}>{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * Pastille de date des cartes compactes.
 *
 * Le prototype remplace l'image par cette pastille dans les tableaux de bord :
 * « dans un dashboard, la photo n'aide pas à décider et coûte de la bande
 * passante ».
 */
export interface DateChipProps extends React.HTMLAttributes<HTMLDivElement> {
  date: Date;
  size?: 'default' | 'large';
}

export function DateChip({ date, size = 'default', className, ...props }: DateChipProps) {
  const { month, day } = formatDateChip(date);

  return (
    <div
      className={cn(
        'shrink-0 rounded-[9px] bg-ink py-1.5 text-center text-white',
        size === 'large' ? 'w-[52px] rounded-field' : 'w-[42px]',
        className,
      )}
      {...props}
    >
      <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-coral-200">
        {month}
      </div>
      <div className="text-[16px] font-bold leading-tight">{day}</div>
    </div>
  );
}
