'use client';

import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Liste déroulante.
 *
 * ── Pourquoi pas le `<select>` natif ────────────────────────────────────────
 * Il ne se dessine pas : chaque navigateur impose son menu, ses couleurs, sa
 * police — et rien du design system n'y entre, ni le rayon des champs, ni
 * l'anneau de focus, ni le mode sombre. Sur un formulaire où tout le reste
 * suit le prototype, c'était le seul élément étranger.
 *
 * ── Ce qui est gardé du natif ───────────────────────────────────────────────
 * Tout ce qui compte pour l'accessibilité et les formulaires, via Radix :
 * clavier (flèches, Entrée, Échap, saisie pour sauter à une entrée), rôle
 * `listbox`, focus ramené sur le déclencheur, et un `<select>` masqué qui
 * porte `name` — un formulaire lu par `FormData` ne voit pas la différence.
 *
 * ── Trois apparences ────────────────────────────────────────────────────────
 *   · `field` — un champ, comme `Input` : bordure, rayon 10 px, 44 px.
 *   · `pill`  — la pastille compacte de l'en-tête (ville).
 *   · `bare`  — sans cadre, pour vivre DANS un autre champ (l'indicatif du
 *     numéro de téléphone).
 */

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  /** Ce qu'affiche le déclencheur une fois l'entrée choisie, si différent du libellé. */
  triggerLabel?: React.ReactNode;
  /** Ligne secondaire dans le menu, en gris. */
  description?: React.ReactNode;
  /** Icône ou pictogramme devant le libellé. */
  leading?: React.ReactNode;
  disabled?: boolean;
  /** Texte utilisé pour la recherche au clavier, quand le libellé n'est pas une chaîne. */
  textValue?: string;
}

export interface SelectGroup {
  label: React.ReactNode;
  options: SelectOption[];
}

export type SelectVariant = 'field' | 'pill' | 'bare';
export type SelectSize = 'default' | 'compact';

export interface SelectProps {
  options: readonly (SelectOption | SelectGroup)[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Affiché tant que rien n'est choisi. */
  placeholder?: React.ReactNode;
  /** Participe au formulaire sous ce nom, comme un `<select>`. */
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  variant?: SelectVariant;
  size?: SelectSize;
  /** Élément devant la valeur, dans le déclencheur : une épingle, un drapeau. */
  leading?: React.ReactNode;
  /** Largeur du menu : celle du déclencheur (défaut) ou celle de son contenu. */
  menuWidth?: 'trigger' | 'content';
  align?: 'start' | 'center' | 'end';
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

function isGroup(entry: SelectOption | SelectGroup): entry is SelectGroup {
  return 'options' in entry;
}

function flatten(options: readonly (SelectOption | SelectGroup)[]): SelectOption[] {
  return options.flatMap((entry) => (isGroup(entry) ? entry.options : [entry]));
}

const TRIGGER_VARIANTS: Record<SelectVariant, string> = {
  field: cn(
    'w-full rounded-field border bg-surface px-[13px] text-[14px]',
    'transition-[border-color,box-shadow] duration-(--duration-hover)',
    'focus:border-text-strong focus:shadow-[var(--focus-ring)]',
    'data-[state=open]:border-text-strong data-[state=open]:shadow-[var(--focus-ring)]',
    'disabled:bg-fill-neutral disabled:text-text-disabled',
  ),
  pill: cn(
    'max-w-[150px] rounded-full bg-paper px-2.5 text-body-s font-semibold text-text-strong',
    'transition-colors duration-(--duration-hover) hover:bg-surface-alt',
    'focus:shadow-[var(--focus-ring)]',
  ),
  bare: cn(
    'rounded-none bg-transparent px-3 text-body font-semibold',
    'transition-colors duration-(--duration-hover) hover:bg-surface-alt',
    'focus:bg-surface-alt',
  ),
};

const TRIGGER_SIZES: Record<SelectSize, string> = {
  default: 'min-h-[var(--tap-min)]',
  compact: 'min-h-9',
};

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    options,
    value,
    defaultValue,
    onValueChange,
    placeholder = 'Choisir…',
    name,
    id,
    disabled,
    required,
    invalid = false,
    variant = 'field',
    size = 'default',
    leading,
    menuWidth = 'trigger',
    align = 'start',
    className,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
  },
  ref,
) {
  // Le déclencheur affiche ce que l'entrée choisie demande — pas forcément
  // son libellé du menu : « 🇧🇯 +229 » fermé, « 🇧🇯 Bénin (+229) » ouvert.
  const [internal, setInternal] = React.useState(defaultValue ?? '');
  const current = value ?? internal;
  const selected = flatten(options).find((option) => option.value === current);

  return (
    <RadixSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => {
        if (value === undefined) setInternal(next);
        onValueChange?.(next);
      }}
      name={name}
      disabled={disabled}
      required={required}
    >
      <RadixSelect.Trigger
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        className={cn(
          'group flex items-center gap-2 text-left outline-none',
          TRIGGER_VARIANTS[variant],
          TRIGGER_SIZES[size],
          variant === 'field' && (invalid ? 'border-red bg-red-tint' : 'border-border-field'),
          'data-[placeholder]:text-text-3',
          className,
        )}
      >
        {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}

        <span className="min-w-0 flex-1 truncate">
          <RadixSelect.Value placeholder={placeholder}>
            {selected ? (selected.triggerLabel ?? selected.label) : undefined}
          </RadixSelect.Value>
        </span>

        <RadixSelect.Icon asChild>
          <ChevronDown
            aria-hidden
            className={cn(
              'shrink-0 text-text-3 transition-transform duration-(--duration-hover)',
              'group-data-[state=open]:rotate-180',
              variant === 'pill' || variant === 'bare' ? 'size-3.5' : 'size-4',
            )}
          />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        {/* Au-dessus des boîtes de dialogue (z-50) : un sélecteur dans une
            modale doit s'ouvrir par-dessus elle, pas derrière. Pas d'animation
            d'ouverture : le prototype n'en admet que trois, et un menu qui
            apparaît net est aussi ce que fait le natif. */}
        <RadixSelect.Content
          position="popper"
          side="bottom"
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-[60] overflow-hidden rounded-card border border-border bg-surface shadow-lg',
            'max-h-[var(--radix-select-content-available-height)]',
            menuWidth === 'trigger'
              ? 'w-[var(--radix-select-trigger-width)]'
              : 'min-w-[var(--radix-select-trigger-width)]',
          )}
        >
          <RadixSelect.ScrollUpButton className="flex h-7 items-center justify-center bg-surface text-text-3">
            <ChevronUp className="size-4" aria-hidden />
          </RadixSelect.ScrollUpButton>

          <RadixSelect.Viewport className="p-1">
            {options.map((entry, index) =>
              isGroup(entry) ? (
                <RadixSelect.Group key={index}>
                  <RadixSelect.Label className="eyebrow px-3 pb-1 pt-2.5 text-text-3">
                    {entry.label}
                  </RadixSelect.Label>
                  {entry.options.map((option) => (
                    <Item key={option.value} option={option} />
                  ))}
                </RadixSelect.Group>
              ) : (
                <Item key={entry.value} option={entry} />
              ),
            )}
          </RadixSelect.Viewport>

          <RadixSelect.ScrollDownButton className="flex h-7 items-center justify-center bg-surface text-text-3">
            <ChevronDown className="size-4" aria-hidden />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
});

function Item({ option }: { option: SelectOption }) {
  return (
    <RadixSelect.Item
      value={option.value}
      disabled={option.disabled}
      textValue={option.textValue ?? (typeof option.label === 'string' ? option.label : undefined)}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2.5 rounded-[8px] py-2.5 pl-3 pr-9 text-[14px] outline-none',
        'transition-colors duration-(--duration-hover)',
        // Le survol et le clavier partagent le même état : `highlighted`.
        'data-[highlighted]:bg-surface-alt data-[highlighted]:text-text-strong',
        'data-[state=checked]:font-semibold',
        'data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled',
      )}
    >
      {option.leading ? (
        <span className="flex shrink-0 items-center text-text-2">{option.leading}</span>
      ) : null}

      <span className="flex min-w-0 flex-1 flex-col">
        <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
        {option.description ? (
          <span className="text-micro font-normal text-text-3">{option.description}</span>
        ) : null}
      </span>

      <RadixSelect.ItemIndicator className="absolute right-3 flex items-center text-coral">
        <Check className="size-4" strokeWidth={2.5} aria-hidden />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
}
