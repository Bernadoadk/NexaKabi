import React from 'react';
import { formatAmount } from '../../lib/format';
import { cn } from '../../lib/layout';

/**
 * Copie de `packages/ui/src/components/money.tsx` : chiffres tabulaires,
 * espace insécable, « FCFA » plus petit et plus léger que le montant.
 */
const SIZES = {
  hero: { amount: 'font-display text-[32px] font-bold tracking-[-0.02em]', symbol: 'text-[16px]' },
  large: { amount: 'font-display text-amount font-bold', symbol: 'text-[16px]' },
  medium: { amount: 'font-display text-[24px] font-bold', symbol: 'text-[12px]' },
  default: { amount: 'text-[18px] font-bold', symbol: 'text-[12px]' },
  small: { amount: 'text-body font-semibold', symbol: 'text-micro font-medium' },
} as const;

export type MoneySize = keyof typeof SIZES;

export const Money: React.FC<{
  amount: number;
  size?: MoneySize;
  hideSymbol?: boolean;
  showSign?: boolean;
  className?: string;
  symbolClassName?: string;
}> = ({
  amount,
  size = 'default',
  hideSymbol = false,
  showSign = false,
  className,
  symbolClassName,
}) => {
  const styles = SIZES[size];
  const sign = showSign && amount > 0 ? '+' : '';

  return (
    <span className={cn('tabular whitespace-nowrap', styles.amount, className)}>
      {sign}
      {formatAmount(amount)}
      {hideSymbol ? null : (
        <>
          {' '}
          <span className={cn('font-medium text-text-2', styles.symbol, symbolClassName)}>
            FCFA
          </span>
        </>
      )}
    </span>
  );
};
