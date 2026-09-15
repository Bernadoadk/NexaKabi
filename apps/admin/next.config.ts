import type { NextConfig } from 'next';

/**
 * Application d'administration.
 *
 * ── Pourquoi une application séparée, et pas un dossier de plus dans `web` ──
 * Trois raisons, dans l'ordre d'importance :
 *
 *  1. **Le cookie.** Une session d'administration porte le droit de consulter
 *     les pièces d'identité de tous les organisateurs et de geler des fonds.
 *     Servie depuis un domaine distinct, elle ne circule jamais avec les
 *     requêtes du site public : un vol de session participant ne donne rien
 *     ici, et réciproquement.
 *
 *  2. **Le code livré.** Rien de l'administration n'est envoyé au navigateur
 *     d'un participant — ni les libellés des motifs de refus, ni les routes,
 *     ni la structure des écrans. Ce qui n'est pas livré ne s'analyse pas.
 *
 *  3. **Le rythme.** L'administration se déploie, casse et se corrige sans
 *     jamais toucher au tunnel d'achat, qui est la partie qu'on ne veut pas
 *     redéployer un vendredi.
 *
 * Le coût réel est faible : elles partagent les mêmes contrats, le même design
 * system et le même paquet d'utilitaires.
 */
const config: NextConfig = {
  reactStrictMode: true,

  transpilePackages: ['@nexakabi/ui'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },

          /**
           * `no-referrer`, plus strict que sur le site public.
           *
           * Une URL d'administration porte des identifiants de dossier dans son
           * chemin. Les laisser fuir dans l'en-tête `Referer` d'une ressource
           * externe suffirait à révéler qu'un dossier existe, et lequel.
           */
          { key: 'Referrer-Policy', value: 'no-referrer' },

          /**
           * Aucune permission de navigateur.
           *
           * L'administration ne prend pas de photo, ne géolocalise pas et
           * n'encaisse rien. Tout refuser coûte zéro et retire d'un coup une
           * catégorie entière de risques.
           */
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },

          /**
           * Interdit l'indexation, quoi qu'il arrive.
           *
           * Le sous-domaine n'est pas censé être public, mais un lien partagé
           * par inadvertance suffit à le faire découvrir. L'en-tête vaut mieux
           * qu'un `robots.txt`, que rien n'oblige à respecter.
           */
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};

export default config;
