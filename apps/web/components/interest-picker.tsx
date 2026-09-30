'use client';

import { Check } from 'lucide-react';
import type { UserInterests } from '@nexakabi/contracts';
import { CategoryIcon, cn } from '@nexakabi/ui';

export interface InterestOption {
  id: string;
  slug: string;
  name: string;
}

/**
 * Choix des goûts : des puces à toucher, rien à taper.
 *
 * Deux groupes — ce qu'on aime, où on sort — et aucun n'est obligatoire :
 * aucune catégorie choisie, tout convient ; aucune ville, partout. Le même
 * composant sert à l'inscription et aux réglages, pour que le geste appris une
 * fois reste le même.
 */
export function InterestPicker({
  categories,
  cities,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  categories: readonly InterestOption[];
  cities: readonly InterestOption[];
  value: UserInterests;
  onChange: (next: UserInterests) => void;
  disabled?: boolean;
  /** Version resserrée, pour l'étape d'inscription. */
  compact?: boolean;
}) {
  function toggle(key: keyof UserInterests, id: string) {
    const current = value[key];
    const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
    onChange({ ...value, [key]: next });
  }

  return (
    <div className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4')}>
      <ChipGroup label="Ce que j’aime">
        {categories.map((category) => (
          <Chip
            key={category.id}
            active={value.categoryIds.includes(category.id)}
            disabled={disabled}
            onClick={() => toggle('categoryIds', category.id)}
          >
            <CategoryIcon slug={category.slug} className="size-3.5" />
            {category.name}
          </Chip>
        ))}
      </ChipGroup>

      {cities.length > 0 ? (
        <ChipGroup label="Où je sors">
          {cities.map((city) => (
            <Chip
              key={city.id}
              active={value.cityIds.includes(city.id)}
              disabled={disabled}
              onClick={() => toggle('cityIds', city.id)}
            >
              {city.name}
            </Chip>
          ))}
        </ChipGroup>
      ) : null}
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-micro font-bold uppercase tracking-wide text-text-3">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/**
 * Même puce que les filtres de la découverte : un geste déjà connu.
 *
 * Une différence, voulue : la puce choisie s'INVERSE avec le thème (fond du
 * texte, texte du fond) au lieu de passer à l'encre. Ici les puces vivent sur
 * une carte, et en thème sombre une puce encre sur une carte presque encre ne
 * se distinguait plus — la coche le dit en plus de la couleur.
 */
function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-body-s font-semibold transition-colors disabled:opacity-60',
        active
          ? 'border-text-strong bg-text-strong text-surface'
          : 'border-border-field bg-surface text-text-2 hover:bg-paper hover:text-text-strong',
      )}
    >
      {children}
      {active ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}
