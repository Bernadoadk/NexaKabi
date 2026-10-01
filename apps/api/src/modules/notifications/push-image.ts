/**
 * Image d'une notification sur l'appareil.
 *
 * ── Pourquoi ne pas envoyer la couverture telle quelle ──────────────────────
 * Une affiche d'événement pèse facilement plusieurs mégaoctets, et le système la
 * télécharge à l'instant où la notification s'affiche — sur un réseau mobile qui
 * se paie au mégaoctet, pour une image montrée dans un cadre de 2 pour 1. Les
 * couvertures sont hébergées chez Cloudinary : on lui demande une version
 * recadrée et compressée plutôt que l'originale.
 *
 * Toute autre origine passe inchangée, mais seulement en `https` : une image en
 * clair serait refusée par le navigateur, et ferait échouer l'affichage de la
 * notification entière.
 */

const CLOUDINARY_HOST = 'res.cloudinary.com';
const UPLOAD_MARKER = '/image/upload/';

/** Recadrage 2:1 centré sur le sujet, JPEG compressé : quelques dizaines de Ko. */
const TRANSFORMATION = 'c_fill,g_auto,w_720,h_360,f_jpg,q_auto';

/** Longueur maximale admise par le message (`pushPayloadSchema`). */
const MAX_LENGTH = 500;

/** Un segment de transformation : `c_fill,w_400`, à ne pas confondre avec `v1234567`. */
const TRANSFORMATION_SEGMENT = /^[a-z]{1,3}_[^/,]+(?:,[a-z]{1,3}_[^/,]+)*$/i;

export function pushImageUrl(coverUrl: string | null | undefined): string | undefined {
  if (!coverUrl) return undefined;

  let url: URL;

  try {
    url = new URL(coverUrl);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'https:') return undefined;

  const marker = url.pathname.indexOf(UPLOAD_MARKER);

  if (url.hostname === CLOUDINARY_HOST && marker !== -1) {
    const after = url.pathname.slice(marker + UPLOAD_MARKER.length);
    const first = after.split('/')[0] ?? '';

    // Déjà transformée par quelqu'un d'autre : on respecte son choix.
    if (!TRANSFORMATION_SEGMENT.test(first)) {
      url.pathname = `${url.pathname.slice(0, marker + UPLOAD_MARKER.length)}${TRANSFORMATION}/${after}`;
    }
  }

  return url.href.length <= MAX_LENGTH ? url.href : undefined;
}
