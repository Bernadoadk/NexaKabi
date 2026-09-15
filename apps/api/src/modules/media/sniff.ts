/**
 * Détection du type réel d'un fichier, par son contenu.
 *
 * ── Le trou que ce fichier bouche ─────────────────────────────────────────
 * `MediaService` documentait que « le type est déterminé par le CONTENU, pas
 * par le nom ni par l'en-tête déclaré ». Il lisait en réalité `file.mimetype`,
 * que multer recopie du `Content-Type` annoncé par le client — c'est-à-dire la
 * chose même que le commentaire disait ne pas croire.
 *
 * Pour les images, `sharp` rattrapait l'erreur en refusant de décoder ce qui
 * n'en est pas une. Pour les PDF, rien : un fichier quelconque annoncé
 * `application/pdf` était stocké tel quel, et servi plus tard sous ce type à
 * un administrateur qui l'ouvrirait en confiance.
 *
 * ── Pourquoi pas `file-type` ──────────────────────────────────────────────
 * Le paquet est distribué en ESM pur, ce qui impose une gymnastique
 * d'import dans un service NestJS compilé en CommonJS. Les cinq formats que ce
 * produit accepte ont des signatures courtes, stables et normalisées : les
 * reconnaître tient en vingt lignes, sans dépendance à tenir à jour.
 *
 * Ce module reconnaît un format ou n'en reconnaît aucun. Il ne cherche pas à
 * deviner : un type inconnu doit être refusé, pas approximé.
 */

/** Types réellement acceptés par le produit. */
export type SniffedType =
  'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' | 'application/pdf';

function startsWith(buffer: Buffer, bytes: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;

  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/**
 * Type réel d'un fichier, ou `null` s'il n'est reconnu d'aucun format accepté.
 *
 * Les signatures viennent des normes elles-mêmes :
 *   · JPEG  — `FF D8 FF` (marqueur SOI)
 *   · PNG   — `89 50 4E 47 0D 0A 1A 0A`
 *   · WebP  — conteneur RIFF, avec « WEBP » en octets 8 à 11
 *   · AVIF  — boîte ISO-BMFF `ftyp`, marque « avif » ou « avis »
 *   · PDF   — `%PDF-`
 */
export function sniffFileType(buffer: Buffer): SniffedType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // RIFF....WEBP : la taille occupe les octets 4 à 7, on saute donc à 8.
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  // ....ftyp<marque> : la taille de boîte précède, la marque suit `ftyp`.
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buffer.subarray(8, 12).toString('latin1');

    // `avis` désigne une séquence AVIF — même conteneur, même décodeur.
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }

  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';

  return null;
}
