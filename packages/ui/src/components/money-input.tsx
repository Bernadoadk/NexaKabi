'use client';

import * as React from 'react';
import { formatAmount, parseAmount, resolveCurrency } from '@nexakabi/utils';
import { AffixField, type AffixFieldProps } from './input';
import { cn } from '../lib/cn';

/**
 * Saisie d'un montant.
 *
 * Le suffixe de devise — « FCFA » au Bénin — est figé sur fond papier à
 * droite, le chiffre est en 16 px semi-gras tabulaire, et la valeur est
 * reformatée avec l'espace insécable dès que le champ perd le focus.
 *
 * `onValueChange` remonte un ENTIER dans la plus petite unité de la devise,
 * jamais une chaîne : aucun flottant ne doit représenter de l'argent.
 */
export interface MoneyInputProps extends Omit<
  AffixFieldProps,
  'suffix' | 'onChange' | 'value' | 'defaultValue' | 'type'
> {
  /** Mode contrôlé : montant en unité entière. */
  value?: number | null;
  /** Mode non contrôlé : montant initial. */
  defaultValue?: number;
  onValueChange?: (amount: number | null) => void;
  /** Devise du montant saisi — celle de l'événement. Absente : celle par défaut. */
  currency?: string | null;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, defaultValue, onValueChange, currency, className, onBlur, ...props },
  ref,
) {
  const definition = resolveCurrency(currency);
  const code = definition.code;

  const [raw, setRaw] = React.useState(() => {
    const initial = value ?? defaultValue;
    return initial === null || initial === undefined ? '' : formatAmount(initial, code);
  });

  React.useEffect(() => {
    if (value === undefined) return;
    setRaw(value === null ? '' : formatAmount(value, code));
  }, [value, code]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setRaw(next);
    onValueChange?.(parseAmount(next, code));
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    const parsed = parseAmount(raw, code);
    if (parsed !== null) setRaw(formatAmount(parsed, code));
    onBlur?.(event);
  }

  return (
    <AffixField
      ref={ref}
      inputMode={definition.decimals === 0 ? 'numeric' : 'decimal'}
      suffix={definition.symbol}
      value={raw}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn('tabular text-[16px] font-bold', className)}
      {...props}
    />
  );
});
