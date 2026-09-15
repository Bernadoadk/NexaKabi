import type { MetadataRoute } from 'next';
import { fetchPublishedSlugs } from '@/lib/events';

const BASE_URL = process.env.SITE_URL ?? 'https://nexakabi.bj';

/**
 * Plan du site.
 *
 * Les pages événement sont la principale porte d'entrée depuis les moteurs de
 * recherche : elles doivent y figurer dès leur publication.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await fetchPublishedSlugs();

  return [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/evenements`, changeFrequency: 'daily', priority: 0.9 },
    ...events.map((event) => ({
      url: `${BASE_URL}/e/${event.slug}`,
      lastModified: new Date(event.updatedAt),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
