import type { MetadataRoute } from 'next';

/**
 * Manifeste PWA.
 *
 * ── Ce que l'installation change vraiment ───────────────────────────────────
 * Un billet ouvert depuis l'écran d'accueil s'affiche sans barre d'adresse,
 * plein écran, et surtout : il reste accessible quand le réseau tombe. Sur un
 * marché où la connexion se paie au mégaoctet et disparaît dans une salle de
 * concert, c'est la différence entre un billet qu'on retrouve et un billet
 * qu'on cherche.
 *
 * ── Pourquoi `portrait` et pas `any` ────────────────────────────────────────
 * Un QR affiché en paysage se retrouve à moitié coupé par le clavier ou la
 * barre d'état sur les appareils d'entrée de gamme. Le produit se tient d'une
 * main, à la verticale.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexa-Kabi — Billetterie événementielle',
    short_name: 'Nexa-Kabi',
    description: 'Achète tes billets, retrouve-les hors ligne, et entre à l’événement avec ton QR.',
    start_url: '/mon-compte/billets',
    // Le point d'entrée est « Mes billets », pas l'accueil : quelqu'un qui
    // installe l'application l'a fait pour retrouver son billet vite.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'fr-BJ',
    dir: 'ltr',
    categories: ['events', 'entertainment', 'lifestyle'],

    // Jetons du prototype : encre en fond, corail en couleur de thème.
    background_color: '#12102B',
    theme_color: '#FF4D2E',

    // Toutes tirées de `public/icons/fav.png` : voir `app/icon.tsx`.
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // `maskable` évite qu'Android rogne le logo dans sa forme d'icône.
      { src: '/maskable-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],

    /**
     * Raccourcis d'appui long.
     *
     * Le billet d'abord — un participant vient le chercher, pas explorer un
     * menu. La carte, parce que c'est la question suivante : « qu'est-ce qu'il
     * y a près de moi ? ». Le scanner en dernier : la plupart n'en ont pas
     * l'usage, mais un bénévole qui a installé l'application participant doit
     * pouvoir y aller sans chercher une adresse.
     */
    shortcuts: [
      {
        name: 'Mes billets',
        short_name: 'Billets',
        url: '/mon-compte/billets',
        description: 'Voir mes billets et leurs QR',
      },
      {
        name: 'Carte des événements',
        short_name: 'Carte',
        url: '/carte',
        description: 'Les événements autour de moi',
      },
      {
        name: 'Scanner',
        short_name: 'Scanner',
        url: '/scan',
        description: 'Contrôler les billets à l’entrée',
      },
    ],
  };
}
