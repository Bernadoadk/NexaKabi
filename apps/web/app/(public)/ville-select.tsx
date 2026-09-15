'use client';

import { ChevronDown, MapPin } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@nexakabi/ui';
import type { City } from '@/lib/events';

/**
 * Sélecteur de ville de l'en-tête.
 *
 * Un `<select>` natif suffit : c'est une navigation, pas un filtre à combiner
 * avec d'autres à la volée — et sur un téléphone, la roue système est plus
 * agréable au pouce qu'un menu maison. Le sélecteur reflète la ville active
 * de l'URL (`?ville=`), pour ne pas afficher « Toutes les villes » sur une
 * page qui n'en montre qu'une.
 *
 * `compact` : la version de l'en-tête mobile — une épingle, le nom, un
 * chevron — sans bordure, pour tenir à côté de la marque et du compte.
 */
export function VilleSelect({ cities, compact = false }: { cities: City[]; compact?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('ville') ?? '';
  const currentName = cities.find((city) => city.slug === current)?.name;

  const select = (
    <select
      aria-label="Choisir une ville"
      value={current}
      onChange={(event) => {
        router.push(
          event.target.value ? `/evenements?ville=${event.target.value}` : '/evenements',
        );
      }}
      className={cn(
        'min-h-[var(--tap-min)] text-body-s font-semibold text-text-strong',
        compact
          ? 'absolute inset-0 w-full cursor-pointer opacity-0'
          : 'rounded-field border border-border-field bg-surface px-2.5',
      )}
    >
      <option value="">Toutes les villes</option>
      {cities.map((city) => (
        <option key={city.id} value={city.slug}>
          {city.name}
        </option>
      ))}
    </select>
  );

  if (!compact) return select;

  return (
    <span className="relative inline-flex min-h-[var(--tap-min)] max-w-[150px] items-center gap-1 rounded-full bg-paper px-2.5 text-body-s font-semibold text-text-strong">
      <MapPin className="size-4 shrink-0 text-coral" aria-hidden />
      <span className="truncate">{currentName ?? 'Partout'}</span>
      <ChevronDown className="size-3.5 shrink-0 text-text-3" aria-hidden />
      {select}
    </span>
  );
}
