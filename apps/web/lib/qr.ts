import 'server-only';
import QRCode from 'qrcode';

/**
 * Rendu du QR d'un billet, côté serveur.
 *
 * Le SVG est produit à la génération de la page, pas dans le navigateur. Trois
 * raisons, toutes liées à l'usage réel :
 *
 *  · Le billet doit s'afficher **hors ligne** une fois la page en cache. Un QR
 *    dessiné par du JavaScript dépendrait d'un script à charger.
 *  · Il doit s'afficher **sans JavaScript** du tout — un vieux téléphone, un
 *    navigateur restreint, un mode économie de données.
 *  · Un SVG s'imprime net à n'importe quelle taille, ce qu'un canvas ne fait pas.
 *
 * ── Choix d'encodage ────────────────────────────────────────────────────────
 * Correction d'erreur **M** (15 %) : le niveau H, plus robuste, densifierait
 * le code au point de le rendre plus difficile à lire à 176 px — le contraire
 * du but recherché. M est le bon compromis pour un écran, où le code n'est ni
 * froissé ni sali.
 *
 * Marge de 2 modules au lieu des 4 de la norme : la « zone de silence » est
 * déjà assurée par le fond blanc du composant qui l'entoure, et 4 modules
 * gaspilleraient un cinquième de la surface disponible.
 */
export async function renderQrSvg(token: string): Promise<string> {
  return QRCode.toString(token, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    // Noir pur sur blanc pur : le contraste maximal est la seule chose qui
    // compte à 40 % de luminosité, dans la pénombre d'une entrée de concert.
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}
