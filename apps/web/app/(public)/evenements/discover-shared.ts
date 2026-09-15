/**
 * Ce que la page (serveur) et la feuille de filtres (client) partagent.
 *
 * Un module client n'exporte vers un composant serveur que des RÉFÉRENCES :
 * une constante importée de `discover-filters.tsx` y arriverait sous forme
 * de proxy, pas de tableau. Les valeurs vivent donc ici, sans directive.
 */
export type DiscoverParams = Record<string, string | undefined>;

export const DATE_FILTERS = [
  ['today', "Aujourd'hui"],
  ['this_week', 'Cette semaine'],
  ['this_weekend', 'Ce week-end'],
  ['this_month', 'Ce mois'],
] as const;

/** Construit l'URL de découverte pour un jeu de filtres. */
export function buildDiscoverHref(next: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value && key !== 'page') query.set(key, value);
  }
  const encoded = query.toString();
  return encoded ? `/evenements?${encoded}` : '/evenements';
}
