import type { MetadataRoute } from 'next';

const BASE_URL = process.env.SITE_URL ?? 'https://nexakabi.bj';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Espaces privés : rien à indexer, et surtout rien à exposer.
      disallow: ['/mon-compte/', '/pro/', '/checkout/', '/api/', '/t/', '/invitation/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
