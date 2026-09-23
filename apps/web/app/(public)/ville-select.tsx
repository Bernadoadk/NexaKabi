'use client';

import { MapPin } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Select, startRouteProgress } from '@nexakabi/ui';
import type { City } from '@/lib/events';

/** « Toutes les villes » : une entrée à part entière, jamais une valeur vide. */
const ALL_CITIES = 'toutes';

/**
 * Sélecteur de ville de l'en-tête.
 *
 * La liste déroulante du design system, comme partout ailleurs : le menu
 * porte les couleurs et le mode sombre de l'application, ce que la roue
 * native ne fait pas. Le sélecteur reflète la ville active de l'URL
 * (`?ville=`), pour ne pas afficher « Toutes les villes » sur une page qui
 * n'en montre qu'une.
 *
 * `compact` : la version de l'en-tête — une épingle, le nom, un chevron —
 * en pastille, pour tenir à côté de la marque et du compte.
 */
export function VilleSelect({ cities, compact = false }: { cities: City[]; compact?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('ville') || ALL_CITIES;

  return (
    <Select
      aria-label="Choisir une ville"
      variant={compact ? 'pill' : 'field'}
      menuWidth="content"
      align={compact ? 'end' : 'start'}
      leading={compact ? <MapPin className="size-4 text-coral" aria-hidden /> : undefined}
      value={current}
      onValueChange={(slug) => {
        // Le menu se referme sur un écran qui n'a pas encore changé : sans le
        // filet, choisir une ville ne produit aucun signe pendant une à deux
        // secondes, et l'utilisateur rouvre le menu pour réessayer.
        startRouteProgress();
        router.push(slug === ALL_CITIES ? '/evenements' : `/evenements?ville=${slug}`);
      }}
      className={compact ? undefined : 'w-auto text-body-s font-semibold text-text-strong'}
      options={[
        { value: ALL_CITIES, label: 'Toutes les villes', triggerLabel: 'Partout' },
        ...cities.map((city) => ({ value: city.slug, label: city.name })),
      ]}
    />
  );
}
