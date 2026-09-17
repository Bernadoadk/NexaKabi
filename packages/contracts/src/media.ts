/**
 * Dépôt de fichiers.
 *
 * ── Pourquoi le fichier ne passe pas par l'API ─────────────────────────────
 * Sur Vercel, chaque fonction plafonne le corps d'une requête à 4,5 Mo, sans
 * réglage possible. Un fichier qui transiterait par le web puis par l'API
 * serait donc refusé bien avant les 10 Mo promis à l'utilisateur. Le
 * navigateur le dépose alors DIRECTEMENT chez le fournisseur de stockage, dans
 * un espace de transit privé, avec un ticket signé par l'API ; puis il ne
 * transmet à l'API qu'une référence de quelques octets. L'API récupère le
 * fichier depuis le transit, applique ses contrôles (le contenu réel décide,
 * tout est ré-encodé) et supprime le transit.
 *
 * Quand aucun fournisseur n'est configuré (poste de développement), le ticket
 * est en mode `relay` : le fichier passe par l'API, comme avant.
 */

import { z } from 'zod';

/** 10 Mo. C'est aussi le plafond par fichier du plan gratuit Cloudinary. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const UPLOAD_MAX_LABEL = '10 Mo';

export interface DirectUploadTicket {
  readonly mode: 'direct';
  /** Point de dépôt du fournisseur, à appeler en `multipart/form-data`. */
  readonly uploadUrl: string;
  /** Champs à joindre au fichier (clé publique, horodatage, signature…). */
  readonly fields: Record<string, string>;
  /** Nom du champ portant le fichier. */
  readonly fileField: string;
  readonly maxBytes: number;
  readonly expiresAt: string;
}

export interface RelayUploadTicket {
  readonly mode: 'relay';
  readonly maxBytes: number;
}

export type UploadTicket = DirectUploadTicket | RelayUploadTicket;

/**
 * Référence d'un fichier déposé en transit, telle que le fournisseur la rend
 * au navigateur. `signature` est celle de la RÉPONSE du fournisseur : l'API la
 * revérifie, ce qui prouve que le dépôt a bien eu lieu chez lui, avec son
 * ticket — pas seulement qu'un identifiant plausible a été inventé.
 */
export const stagedUploadSchema = z.object({
  publicId: z.string().min(1).max(255),
  version: z.number().int().nonnegative(),
  signature: z.string().min(1).max(128),
  /** Nom d'origine, pour une extension de repli. */
  name: z.string().max(255).optional(),
  /** Type MIME annoncé par le navigateur — un indice, jamais une vérité. */
  type: z.string().max(100).optional(),
});

export type StagedUpload = z.infer<typeof stagedUploadSchema>;

/** Résultat d'un dépôt de visuel. `thumbnailUrl` n'existe que pour une couverture. */
export interface UploadedMedia {
  readonly url: string;
  readonly thumbnailUrl?: string;
  readonly sizeBytes: number;
  readonly originalSizeBytes: number;
}
