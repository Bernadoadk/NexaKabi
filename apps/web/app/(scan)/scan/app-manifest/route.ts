import type { MetadataRoute } from 'next';

/**
 * Manifeste PWA du SCANNER, distinct de celui du site.
 *
 * ── Pourquoi deux manifestes ────────────────────────────────────────────────
 * Un contrôleur qui installe l'application sur son téléphone l'installe pour
 * scanner. Le manifeste du site l'enverrait sur « Mes billets » — un écran qui
 * ne le concerne pas, le soir où il tient une porte avec une file derrière
 * lui. Celui-ci démarre sur le scanner, se limite à sa zone, et porte son
 * propre nom sur l'écran d'accueil : « Scanner Nexa-Kabi », à côté de
 * l'application participant si la même personne a les deux.
 *
 * Servi par une route plutôt qu'un fichier statique pour rester dans le même
 * typage que `app/manifest.ts` — Next ne permet qu'un manifeste déclaratif.
 *
 * ── Pourquoi `/scan/app-manifest` et pas `/scan/manifest.webmanifest` ──────
 * `manifest.webmanifest` est un nom de fichier RÉSERVÉ par Next pour les
 * métadonnées. Un dossier de route qui le porte, même dans un sous-chemin,
 * désoriente le routeur : toutes les pages du site répondaient 404. Un
 * manifeste n'a pas besoin d'extension — le type MIME suffit.
 */
export function GET(): Response {
  const manifest: MetadataRoute.Manifest = {
    name: 'Nexa-Kabi — Scanner',
    short_name: 'Scanner',
    description: 'Contrôle à l’entrée : scanne les billets, même sans réseau.',
    id: '/scan',
    start_url: '/scan',
    scope: '/scan',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'fr-BJ',
    dir: 'ltr',
    categories: ['productivity', 'utilities'],
    background_color: '#0B0918',
    theme_color: '#0B0918',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
