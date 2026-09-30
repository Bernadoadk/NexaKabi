import type { MetadataRoute } from 'next';

/**
 * Manifeste d'installation de la console.
 *
 * ── Le manque qu'il comble ──────────────────────────────────────────────────
 * Il n'y en avait aucun. « Ajouter à l'écran d'accueil » ne produisait donc
 * pas une application mais un simple raccourci, ouvert dans un onglet avec sa
 * barre d'adresse et ses gestes de navigation — ce qui explique l'impression
 * de consulter une page de bureau posée sur un téléphone. Avec ce fichier,
 * Android et iOS ouvrent la console en plein écran, sans chrome de navigateur.
 *
 * ── Ce qu'il ne fait PAS ────────────────────────────────────────────────────
 * Aucun service worker, aucune mise en cache hors ligne : contrairement au
 * billet d'un participant, un écran d'administration périmé est dangereux. Un
 * solde, une file de vérifications ou un retrait « en attente » lus dans un
 * cache conduiraient à décider sur des chiffres faux. La console exige donc le
 * réseau, et le dit en échouant plutôt qu'en servant du vieux.
 *
 * `start_url` est la racine — le tableau de bord, c'est-à-dire la liste de ce
 * qui attend une décision. C'est la raison pour laquelle on ouvre la console.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexa-Kabi — Administration',
    short_name: 'Administration',
    description:
      'Console d’administration Nexa-Kabi : vérifications, signalements, retraits et finance.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'fr-BJ',
    dir: 'ltr',

    // Mêmes jetons que le reste du produit : encre en fond, corail en thème.
    background_color: '#12102B',
    theme_color: '#FF4D2E',

    // Toutes tirées de `public/icons/fav.png` : voir `app/icon.tsx`.
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
