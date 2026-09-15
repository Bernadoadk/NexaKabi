'use client';

import * as React from 'react';
import { formatPhone, tryNormalizePhone } from '@nexakabi/utils';
import { AffixField, type AffixFieldProps } from './input';
import { cn } from '../lib/cn';

/**
 * Saisie d'un numéro de téléphone béninois.
 *
 * Le numéro est l'identifiant d'authentification du produit : c'est le champ
 * le plus important de l'application. Il est donc présenté en premier partout,
 * avec l'indicatif figé « 🇧🇯 +229 » sur fond papier, exactement comme dans le
 * prototype.
 *
 * La valeur remontée par `onValueChange` est TOUJOURS normalisée en E.164
 * (`+2290197441208`), ou `null` tant que la saisie est incomplète. L'ancien
 * format à 8 chiffres est accepté et converti. Voir docs/PROJECT_ANALYSIS.md §8 (A2).
 */
export interface PhoneInputProps extends Omit<
  AffixFieldProps,
  'prefix' | 'onChange' | 'value' | 'defaultValue' | 'type'
> {
  /** Mode contrôlé : valeur E.164 ou saisie brute. */
  value?: string;
  /** Mode non contrôlé : valeur initiale, dans n'importe quel format accepté. */
  defaultValue?: string;
  /** Reçoit la valeur E.164, ou `null` si la saisie n'est pas encore valide. */
  onValueChange?: (e164: string | null, raw: string) => void;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, defaultValue, onValueChange, className, ...props },
  ref,
) {
  // Le champ est toujours contrôlé en interne : la valeur affichée est
  // reformatée à chaque frappe. `defaultValue` ne sert qu'à l'initialisation.
  const [raw, setRaw] = React.useState(() => toDisplay(value ?? defaultValue));

  React.useEffect(() => {
    if (value === undefined) return;
    setRaw(toDisplay(value));
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setRaw(next);
    onValueChange?.(tryNormalizePhone(next), next);
  }

  return (
    <AffixField
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="01 97 44 12 08"
      prefix={
        <>
          <span aria-hidden="true">🇧🇯</span>
          <span>+229</span>
        </>
      }
      value={raw}
      onChange={handleChange}
      className={cn('tabular', className)}
      {...props}
    />
  );
});

/** Formate une valeur d'entrée pour l'affichage national, sans jamais échouer. */
function toDisplay(input: string | undefined): string {
  if (!input) return '';
  const normalized = tryNormalizePhone(input);
  return normalized ? formatPhone(normalized, 'national') : input;
}
