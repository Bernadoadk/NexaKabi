import * as React from 'react';
import { formatAmount, getCurrency, type CurrencyCode } from '@nexakabi/utils';
import { cn } from '../lib/cn';

/**
 * Affichage d'un montant.
 *
 * TOUT montant affiché dans le produit passe par ce composant. Il garantit
 * les trois règles du prototype :
 *   — espace insécable comme séparateur de milliers (« 5 000 FCFA ») ;
 *   — chiffres tabulaires, pour que les colonnes s'alignent ;
 *   — suffixe « FCFA » toujours à un poids et une taille inférieurs au chiffre.
 */

export type MoneySize = 'hero' | 'large' | 'medium' | 'default' | 'small';

const SIZE_STYLES: Record<MoneySize, { amount: string; symbol: string }> = {
  /** 32 px — total à payer du récapitulatif. */
  hero: { amount: 'font-display text-[32px] font-bold tracking-[-0.02em]', symbol: 'text-[16px]' },
  /** 30 px — montant principal, solde disponible. */
  large: { amount: 'font-display text-amount font-bold', symbol: 'text-[16px]' },
  /** 24 px — tuiles de statistiques. */
  medium: { amount: 'font-display text-[24px] font-bold', symbol: 'text-[12px]' },
  /** 18–19 px — montant secondaire, prix sur une carte. */
  default: { amount: 'text-[18px] font-bold', symbol: 'text-[12px]' },
  /** 13,5–15 px — cellule de table. */
  small: { amount: 'text-body font-semibold', symbol: 'text-micro font-medium' },
};

export interface MoneyProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  amount: number;
  currency?: CurrencyCode;
  size?: MoneySize;
  /** Masque le suffixe de devise, quand la colonne l'indique déjà. */
  hideSymbol?: boolean;
  /** Force l'affichage du signe, y compris pour un montant positif. */
  showSign?: boolean;
}

export function Money({
  amount,
  currency = 'XOF',
  size = 'default',
  hideSymbol = false,
  showSign = false,
  className,
  ...props
}: MoneyProps) {
  const styles = SIZE_STYLES[size];
  const formatted = formatAmount(amount, currency);
  const symbol = getCurrency(currency).symbol;
  const sign = showSign && amount > 0 ? '+' : '';

  return (
    <span className={cn('tabular whitespace-nowrap', styles.amount, className)} {...props}>
      {sign}
      {formatted}
      {hideSymbol ? null : (
        <>
          {' '}
          <span className={cn('font-medium text-text-2', styles.symbol)}>{symbol}</span>
        </>
      )}
    </span>
  );
}
