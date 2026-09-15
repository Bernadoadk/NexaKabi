import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * Bornes des dépôts de fichiers, appliquées PAR MULTER.
 *
 * ── Pourquoi la limite ne peut pas vivre uniquement dans le service ────────
 * `MediaService` refuse bien au-delà de 8 Mo — mais il le fait après coup, sur
 * un tampon que multer a déjà chargé intégralement en mémoire. Un envoi de
 * deux gigaoctets épuisait donc le tas du processus avant d'atteindre la
 * moindre ligne de validation : le service tombait, pour tout le monde, sans
 * qu'aucun contrôle n'ait été franchi.
 *
 * Ces options coupent le flux dès l'octet de trop. Le contrôle applicatif
 * reste en place : il porte sur le contenu réel, là où celui-ci ne porte que
 * sur la taille.
 *
 * `files: 1` et `fields` bornés ferment les deux autres abus classiques du
 * format multipart : cent fichiers dans une seule requête, ou des milliers de
 * champs dont l'analyse coûte plus cher que les données.
 */
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const SINGLE_FILE_UPLOAD: MulterOptions = {
  limits: {
    fileSize: UPLOAD_MAX_BYTES,
    files: 1,
    fields: 20,
    fieldNameSize: 100,
    fieldSize: 8 * 1024,
    parts: 25,
  },
};
