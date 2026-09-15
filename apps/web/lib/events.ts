import 'server-only';
import type { EventDetail, EventSummary, PaginatedResult } from '@nexakabi/contracts';
import { apiFetch } from './api';

/**
 * Accès au catalogue public.
 *
 * Ces requêtes servent le chemin le plus emprunté du produit : elles sont
 * revalidées périodiquement plutôt qu'à chaque visite, ce qui permet de servir
 * la page depuis un cache et de tenir le budget de 150 Ko.
 */

/** Le catalogue tolère une minute de décalage ; le stock exact est revérifié à l'achat. */
const CATALOG_REVALIDATE_SECONDS = 60;

export interface HomeSections {
  upcoming: EventSummary[];
  thisWeekend: EventSummary[];
  free: EventSummary[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  colorToken: string;
  icon: string | null;
}

export interface City {
  id: string;
  slug: string;
  name: string;
}

export async function fetchHomeSections(citySlug?: string): Promise<HomeSections> {
  const query = citySlug ? `?ville=${encodeURIComponent(citySlug)}` : '';
  const result = await apiFetch<HomeSections>(`/events/home${query}`, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });

  return result.ok ? result.data : { upcoming: [], thisWeekend: [], free: [] };
}

export async function searchEvents(
  params: Record<string, string | undefined>,
): Promise<PaginatedResult<EventSummary>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  const result = await apiFetch<PaginatedResult<EventSummary>>(`/events?${query.toString()}`, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });

  return result.ok ? result.data : { items: [], page: 1, pageSize: 24, total: 0, totalPages: 1 };
}

export async function fetchEvent(slug: string): Promise<EventDetail | null> {
  const result = await apiFetch<EventDetail>(`/events/${encodeURIComponent(slug)}`, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });

  return result.ok ? result.data : null;
}

export async function fetchCategories(): Promise<Category[]> {
  // Référentiel quasi immuable : une heure de cache est largement suffisante.
  const result = await apiFetch<Category[]>('/categories', { revalidate: 3600 });
  return result.ok ? result.data : [];
}

export async function fetchCities(): Promise<City[]> {
  const result = await apiFetch<City[]>('/cities', { revalidate: 3600 });
  return result.ok ? result.data : [];
}

export interface OrganizerPage {
  organization: {
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    cityName: string | null;
    verified: boolean;
    whatsapp: string | null;
  };
  upcoming: EventSummary[];
  past: EventSummary[];
}

export async function fetchOrganizerPage(slug: string): Promise<OrganizerPage | null> {
  const result = await apiFetch<OrganizerPage>(
    `/organizations/${encodeURIComponent(slug)}/public`,
    { revalidate: CATALOG_REVALIDATE_SECONDS },
  );

  return result.ok ? result.data : null;
}

export async function fetchPublishedSlugs(): Promise<Array<{ slug: string; updatedAt: string }>> {
  const result = await apiFetch<Array<{ slug: string; updatedAt: string }>>('/sitemap/events', {
    revalidate: 3600,
  });

  return result.ok ? result.data : [];
}
