import 'server-only';
import type { Country } from '@nexakabi/contracts';
import { apiFetch } from './api';

/** Une heure : la liste des pays ouverts change à l'échelle des mois. */
const COUNTRIES_REVALIDATE_SECONDS = 3_600;

/**
 * Pays ouverts sur la plateforme.
 *
 * Ce que les sélecteurs proposent — jamais un pays fermé, où aucun moyen de
 * paiement ne fonctionnerait. Une liste vide vaut mieux qu'une page en erreur :
 * le formulaire retombe alors sur le pays par défaut.
 */
export async function fetchCountries(): Promise<Country[]> {
  const result = await apiFetch<Country[]>('/countries', {
    revalidate: COUNTRIES_REVALIDATE_SECONDS,
  });

  return result.ok ? result.data : [];
}
