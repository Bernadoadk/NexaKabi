import { UPLOAD_MAX_BYTES as CONTRACT_MAX_BYTES } from '@nexakabi/contracts';

/**
 * Bornes et forme des dépôts de fichiers relayés par l'API.
 *
 * La voie normale d'un fichier est le dépôt direct chez le stockage (voir
 * `MediaIntakeService`) ; ce fichier-ci ne concerne que le RELAIS, utilisé
 * quand aucun fournisseur n'est configuré (développement).
 *
 * ── Un relais voyage en corps brut, jamais en `multipart/form-data` ────────
 * Le web envoie alors le fichier tel quel, en `application/octet-stream`, son
 * nom et son type déclaré dans deux en-têtes. Ce n'est pas un choix de goût :
 * sur Vercel, la bordure du projet API (preset NestJS, Fluid compute) répond
 * « 503 SERVICE_UNAVAILABLE » à toute requête `multipart/form-data` dont le
 * corps dépasse ~1 Mo — AVANT d'invoquer la fonction, donc sans la moindre
 * trace dans ses journaux — alors qu'elle transmet un corps brut de même
 * taille jusqu'à sa limite de 4,5 Mo. Mesuré le 17 septembre 2026.
 *
 * ── Pourquoi la limite vit dans le parseur, pas seulement dans le service ──
 * `MediaService` refuse bien au-delà de la limite — mais il le fait après
 * coup, sur un tampon déjà chargé intégralement en mémoire. Un envoi de deux
 * gigaoctets épuiserait le tas du processus avant d'atteindre la moindre ligne
 * de validation. `limit` coupe le flux dès l'octet de trop (`main.ts`), et
 * `inflate: false` refuse un corps compressé, dont la taille réelle ne se
 * connaît qu'une fois décompressé.
 */
export const UPLOAD_MAX_BYTES = CONTRACT_MAX_BYTES;

/** Seul type de contenu accepté pour un dépôt : le fichier, octet pour octet. */
export const UPLOAD_CONTENT_TYPE = 'application/octet-stream';

/** Nom d'origine du fichier, encodé `encodeURIComponent` (les en-têtes HTTP sont en ASCII). */
export const UPLOAD_NAME_HEADER = 'x-file-name';

/** Type MIME annoncé par le navigateur. Un indice, jamais une vérité : le contenu fait foi. */
export const UPLOAD_TYPE_HEADER = 'x-file-type';
