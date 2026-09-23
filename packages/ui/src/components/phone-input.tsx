'use client';

import * as React from 'react';
import {
  detectPhoneCountry,
  formatPhone,
  getPhoneCountryRule,
  listPhoneCountryRules,
  tryNormalizePhone,
  tryNormalizePhoneForCountry,
  type PhoneCountryRule,
} from '@nexakabi/utils';
import { AffixField, type AffixFieldProps } from './input';
import { Select } from './select';
import { cn } from '../lib/cn';

/**
 * Saisie d'un numéro de téléphone.
 *
 * Le numéro est l'identifiant d'authentification du produit : c'est le champ
 * le plus important de l'application. Il est donc présenté en premier partout,
 * avec l'indicatif sur fond papier, exactement comme dans le prototype.
 *
 * ── Un pays, pas une constante ──────────────────────────────────────────────
 * Les utilisateurs ne sont pas forcément béninois. Trois façons de fixer le
 * pays du numéro :
 *   · rien — Bénin, le pays par défaut, indicatif figé ;
 *   · `countryCode` — pays imposé par le contexte (le pays de paiement d'une
 *     commande, le pays de réception d'un organisateur), indicatif figé ;
 *   · `selectableCountry` — l'indicatif devient un SÉLECTEUR : c'est le cas de
 *     la connexion et des coordonnées d'achat, où seule la personne sait d'où
 *     elle vient. `countryCode` sert alors de pays initial.
 *
 * La valeur remontée par `onValueChange` est TOUJOURS normalisée en E.164,
 * ou `null` tant que la saisie est incomplète.
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
  /** Pays du numéro (ISO alpha-2). Absent : Bénin, règle de l'identifiant de connexion. */
  countryCode?: string;
  /** L'indicatif devient un sélecteur parmi tous les pays connus. */
  selectableCountry?: boolean;
  /** Avec `selectableCountry` : le pays choisi a changé. */
  onCountryChange?: (countryCode: string) => void;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  {
    value,
    defaultValue,
    onValueChange,
    countryCode,
    selectableCountry = false,
    onCountryChange,
    className,
    id,
    ...props
  },
  ref,
) {
  const [chosenCountry, setChosenCountry] = React.useState(() => {
    if (countryCode) return countryCode.toUpperCase();
    if (!selectableCountry) return undefined;
    // Une valeur initiale en E.164 dit d'où elle vient : le sélecteur s'y met.
    const initial = value ?? defaultValue;
    return (initial && detectPhoneCountry(initial)?.countryCode) || 'BJ';
  });

  // Un pays imposé par le parent l'emporte sur le choix local.
  React.useEffect(() => {
    if (countryCode && !selectableCountry) setChosenCountry(countryCode.toUpperCase());
  }, [countryCode, selectableCountry]);

  const rule = chosenCountry ? getPhoneCountryRule(chosenCountry) : null;
  const normalize = React.useCallback(
    (input: string) =>
      rule ? tryNormalizePhoneForCountry(input, rule.countryCode) : tryNormalizePhone(input),
    [rule],
  );

  // Le champ est toujours contrôlé en interne : la valeur affichée est
  // reformatée à chaque frappe. `defaultValue` ne sert qu'à l'initialisation.
  const [raw, setRaw] = React.useState(() => toDisplay(value ?? defaultValue, normalize));

  React.useEffect(() => {
    if (value === undefined) return;
    setRaw(toDisplay(value, normalize));
  }, [value, normalize]);

  // Changer de pays change la règle : une valeur normalisée pour l'ancien
  // pays ne l'est plus pour le nouveau, et le parent doit le savoir.
  const previousRule = React.useRef(rule);
  React.useEffect(() => {
    if (previousRule.current === rule) return;
    previousRule.current = rule;
    onValueChange?.(normalize(raw), raw);
    // `raw` est volontairement absent : seul le changement de règle déclenche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setRaw(next);
    onValueChange?.(normalize(next), next);
  }

  const dialCode = rule?.dialCode ?? '229';
  const flag = rule?.flag ?? '🇧🇯';
  const placeholder =
    !rule || rule.countryCode === 'BJ'
      ? '01 97 44 12 08'
      : placeholderFor(rule.nationalLengths[0] ?? 8);

  const prefix = selectableCountry ? (
    <CountrySelect
      id={id ? `${id}-country` : undefined}
      value={chosenCountry ?? 'BJ'}
      disabled={props.disabled}
      onChange={(next) => {
        setChosenCountry(next);
        onCountryChange?.(next);
      }}
    />
  ) : (
    <>
      <span aria-hidden="true">{flag}</span>
      <span>+{dialCode}</span>
    </>
  );

  return (
    <AffixField
      ref={ref}
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder={placeholder}
      prefix={prefix}
      value={raw}
      onChange={handleChange}
      className={cn('tabular', className)}
      {...props}
    />
  );
});

/**
 * Sélecteur d'indicatif, à la place de l'indicatif figé.
 *
 * La liste déroulante du design system, sans cadre, logée dans la zone de
 * préfixe du champ : fermée, elle montre le drapeau et l'indicatif ; ouverte,
 * le nom du pays. Même clavier, même menu que partout ailleurs.
 */
function CountrySelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id?: string;
  value: string;
  disabled?: boolean;
  onChange: (countryCode: string) => void;
}) {
  const rules: readonly PhoneCountryRule[] = listPhoneCountryRules();

  return (
    <Select
      id={id}
      aria-label="Pays du numéro"
      variant="bare"
      size="compact"
      menuWidth="content"
      value={value}
      disabled={disabled}
      onValueChange={onChange}
      className="-mx-3 h-full"
      options={rules.map((rule) => ({
        value: rule.countryCode,
        label: `${rule.name} (+${rule.dialCode})`,
        leading: <span aria-hidden="true">{rule.flag}</span>,
        triggerLabel: (
          <>
            <span aria-hidden="true">{rule.flag}</span> +{rule.dialCode}
          </>
        ),
        textValue: rule.name,
      }))}
    />
  );
}

/** Formate une valeur d'entrée pour l'affichage national, sans jamais échouer. */
function toDisplay(input: string | undefined, normalize: (input: string) => string | null): string {
  if (!input) return '';
  const normalized = normalize(input);
  return normalized ? formatPhone(normalized, 'national') : input;
}

/**
 * « 12 34 56 78 90 » pour dix chiffres, « 123 45 67 89 » pour neuf : la forme
 * d'un numéro du pays, groupée comme `formatPhone` le fera, pas un vrai numéro.
 */
function placeholderFor(length: number): string {
  const digits = Array.from({ length }, (_, index) => String((index + 1) % 10)).join('');
  const head = digits.length % 2 === 1 ? digits.slice(0, 3) : '';
  const rest = digits
    .slice(head.length)
    .replace(/(\d{2})(?=\d)/g, '$1 ')
    .trim();
  return head ? `${head} ${rest}`.trim() : rest;
}
