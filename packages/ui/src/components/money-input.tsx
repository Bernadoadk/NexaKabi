'use client';

import * as React from 'react';
import { formatAmount, parseAmount } from '@nexakabi/utils';
import { AffixField, type AffixFieldProps } from './input';
import { cn } from '../lib/cn';

/**
 * Saisie d'un montant en FCFA.
 *
 * Le suffixe « FCFA » est figé sur fond papier à droite, le chiffre est en
 * 16 px semi-gras tabulaire, et la valeur est reformatée avec l'espace
 * insécable dès que le champ perd le focus.
 *
 * `onValueChange` remonte un ENTIER, jamais une chaîne : le FCFA n'a pas de
 * sous-unité et aucun flottant ne doit représenter de l'argent.
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
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, defaultValue, onValueChange, className, onBlur, ...props },
  ref,
) {
  const [raw, setRaw] = React.useState(() => {
    const initial = value ?? defaultValue;
    return initial === null || initial === undefined ? '' : formatAmount(initial);
  });

  React.useEffect(() => {
    if (value === undefined) return;
    setRaw(value === null ? '' : formatAmount(value));
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setRaw(next);
    onValueChange?.(parseAmount(next));
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    const parsed = parseAmount(raw);
    if (parsed !== null) setRaw(formatAmount(parsed));
    onBlur?.(event);
  }

  return (
    <AffixField
      ref={ref}
      inputMode="numeric"
      suffix="FCFA"
      value={raw}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn('tabular text-[16px] font-bold', className)}
      {...props}
    />
  );
});
