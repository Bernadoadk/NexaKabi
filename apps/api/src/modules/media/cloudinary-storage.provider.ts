import { timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { UPLOAD_MAX_BYTES, type DirectUploadTicket, type StagedUpload } from '@nexakabi/contracts';
import type { Env } from '../../config/env';
import {
  PutObjectInput,
  StorageProvider,
  type StagedFile,
  type StoredFile,
} from './storage.provider';

/**
 * Espace de transit des dépôts directs.
 *
 * `raw` : Cloudinary stocke les octets tels quels, sans les interpréter — c'est
 * le `MediaService` qui décide de ce qu'ils sont. `authenticated` : illisible
 * sans URL signée, donc jamais exposé le temps qu'il reste là. Le préfixe
 * porte l'identifiant du déposant : la reprise vérifie qu'on relit bien le
 * sien, et pas celui d'un autre dont on aurait deviné l'identifiant.
 */
const STAGING_PREFIX = 'incoming';
const STAGING_RESOURCE_TYPE = 'raw';
const STAGING_DELIVERY_TYPE = 'authenticated';

/** Un ticket Cloudinary vaut une heure après son horodatage. */
const TICKET_LIFETIME_SECONDS = 60 * 60;

/**
 * Stockage Cloudinary — implémentation de production.
 *
 * ── Ce que la clé encode ────────────────────────────────────────────────────
 * `StorageProvider.put()` ne rend qu'une `key` opaque, que `remove()` et
 * `signedUrl()` reçoivent plus tard SANS connaître ni la visibilité ni le type
 * du fichier. Cloudinary a besoin des deux (`type` et `resource_type`) pour
 * retrouver un objet : ils voyagent donc DANS la clé plutôt que dans une
 * colonne séparée en base — un objet déjà en base n'a qu'une clé à lire pour
 * savoir comment se supprimer ou se signer, jamais deux champs à recouper.
 *
 *   `<type Cloudinary>|<resource_type>|<public_id>`
 *   ex. `upload|image|events/3f2c…`      (visuel public)
 *   ex. `authenticated|raw|verification/9a1b…`  (pièce privée)
 *
 * ── Public vs privé ─────────────────────────────────────────────────────────
 * `visibility: 'public'` → `type: 'upload'`, lisible par son URL directe,
 * comme tout visuel du produit. `visibility: 'private'` → `type:
 * 'authenticated'` : Cloudinary refuse de le servir sans une URL SIGNÉE —
 * `signedUrl()` la produit à la demande, jamais stockée. Ce n'est pas encore
 * une expiration au sens strict (ça suppose la fonctionnalité Cloudinary
 * « Auth Token », qui exige une clé distincte configurée côté tableau de
 * bord) : c'est déjà l'amélioration qui compte — un document d'identité
 * n'est plus une URL publique devinable, contrairement au stockage local.
 */
@Injectable()
export class CloudinaryStorageProvider extends StorageProvider {
  readonly code = 'cloudinary';

  private readonly logger = new Logger(CloudinaryStorageProvider.name);
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(config: ConfigService<Env, true>) {
    super();

    this.cloudName = config.get('CLOUDINARY_CLOUD_NAME', { infer: true });
    this.apiKey = config.get('CLOUDINARY_API_KEY', { infer: true });
    this.apiSecret = config.get('CLOUDINARY_API_SECRET', { infer: true });

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
  }

  /**
   * Ticket de dépôt direct.
   *
   * La signature couvre TOUS les paramètres du dépôt — identifiant, type de
   * livraison, horodatage : le navigateur ne peut ni choisir où le fichier
   * atterrit, ni le rendre public, ni réutiliser le ticket au-delà de l'heure.
   * La clé secrète, elle, ne quitte jamais ce processus.
   */
  async createUploadTicket(ownerId: string): Promise<DirectUploadTicket> {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      public_id: `${STAGING_PREFIX}/${ownerId}/${cryptoRandomId()}`,
      timestamp,
      type: STAGING_DELIVERY_TYPE,
    };

    return Promise.resolve({
      mode: 'direct',
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${STAGING_RESOURCE_TYPE}/upload`,
      fields: {
        api_key: this.apiKey,
        public_id: params.public_id,
        timestamp: String(timestamp),
        type: params.type,
        signature: cloudinary.utils.api_sign_request(params, this.apiSecret),
      },
      fileField: 'file',
      maxBytes: UPLOAD_MAX_BYTES,
      expiresAt: new Date((timestamp + TICKET_LIFETIME_SECONDS) * 1000).toISOString(),
    });
  }

  /**
   * Reprend un fichier du transit.
   *
   * Deux vérifications avant de lire quoi que ce soit : l'identifiant est bien
   * dans l'espace du déposant, et la signature de la réponse Cloudinary
   * correspond — elle est calculée avec la clé secrète, donc infalsifiable
   * depuis un navigateur. L'objet est supprimé aussitôt lu : réussite ou
   * échec des contrôles qui suivent, il n'a plus rien à faire là.
   */
  async takeStaged(reference: StagedUpload, ownerId: string): Promise<StagedFile> {
    const { publicId, version, signature } = reference;

    if (!publicId.startsWith(`${STAGING_PREFIX}/${ownerId}/`)) {
      throw new BadRequestException('Ce fichier ne correspond à aucun dépôt en cours.');
    }

    const expected = cloudinary.utils.api_sign_request(
      { public_id: publicId, version: String(version) },
      this.apiSecret,
    );

    if (!constantTimeEqual(signature, expected)) {
      throw new BadRequestException('Ce fichier ne correspond à aucun dépôt en cours.');
    }

    const url = cloudinary.url(publicId, {
      resource_type: STAGING_RESOURCE_TYPE,
      type: STAGING_DELIVERY_TYPE,
      version,
      sign_url: true,
      secure: true,
    });

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new BadRequestException(
          'Le fichier déposé est introuvable. Réessaie le dépôt depuis le début.',
        );
      }

      const declared = Number(response.headers.get('content-length'));
      if (declared > UPLOAD_MAX_BYTES) {
        throw new BadRequestException('Fichier trop lourd. 10 Mo au maximum.');
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.byteLength > UPLOAD_MAX_BYTES) {
        throw new BadRequestException('Fichier trop lourd. 10 Mo au maximum.');
      }

      return { buffer, sizeBytes: buffer.byteLength };
    } finally {
      await this.discardStaged(publicId);
    }
  }

  /**
   * Évacue les dépôts jamais conclus — navigateur fermé entre le dépôt et
   * l'envoi de la référence. Ils sont privés et petits, mais autant ne pas
   * laisser le transit grossir indéfiniment.
   */
  async purgeStaged(olderThan: Date): Promise<number> {
    const stale: string[] = [];
    let cursor: string | undefined;

    do {
      const page = (await cloudinary.api.resources({
        resource_type: STAGING_RESOURCE_TYPE,
        type: STAGING_DELIVERY_TYPE,
        prefix: `${STAGING_PREFIX}/`,
        max_results: 500,
        next_cursor: cursor,
      })) as { resources: { public_id: string; created_at: string }[]; next_cursor?: string };

      for (const resource of page.resources) {
        if (new Date(resource.created_at) < olderThan) stale.push(resource.public_id);
      }
      cursor = page.next_cursor;
    } while (cursor);

    // L'API d'administration accepte cent identifiants par appel.
    for (let index = 0; index < stale.length; index += 100) {
      await cloudinary.api.delete_resources(stale.slice(index, index + 100), {
        resource_type: STAGING_RESOURCE_TYPE,
        type: STAGING_DELIVERY_TYPE,
        invalidate: true,
      });
    }

    return stale.length;
  }

  private async discardStaged(publicId: string): Promise<void> {
    try {
      // `invalidate` : sans lui, le CDN continue de servir l'objet supprimé
      // quelque temps — et la même référence pourrait être rejouée.
      await cloudinary.uploader.destroy(publicId, {
        resource_type: STAGING_RESOURCE_TYPE,
        type: STAGING_DELIVERY_TYPE,
        invalidate: true,
      });
    } catch (error) {
      // Un transit qui traîne sera repris par `purgeStaged()` : pas de quoi
      // faire échouer un dépôt déjà lu.
      this.logger.warn({ err: error }, `Transit non supprimé : ${publicId}`);
    }
  }

  async put(input: PutObjectInput): Promise<StoredFile> {
    const resourceType = resourceTypeFor(input.mimeType);
    const deliveryType = input.visibility === 'private' ? 'authenticated' : 'upload';
    const publicId = `${input.folder}/${cryptoRandomId()}`;

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: resourceType,
          type: deliveryType,
          overwrite: false,
        },
        (error, response) => {
          if (error || !response) {
            reject(error ?? new Error('Cloudinary n’a renvoyé aucun résultat.'));
            return;
          }
          resolve(response);
        },
      );
      stream.end(input.buffer);
    });

    this.logger.log(`Fichier déposé sur Cloudinary : ${result.public_id} (${result.bytes} octets)`);

    return {
      key: `${deliveryType}|${resourceType}|${result.public_id}`,
      url: result.secure_url,
      sizeBytes: result.bytes ?? input.buffer.byteLength,
      mimeType: input.mimeType,
    };
  }

  async remove(key: string): Promise<void> {
    const parsed = parseKey(key);
    if (!parsed) return;

    try {
      await cloudinary.uploader.destroy(parsed.publicId, {
        resource_type: parsed.resourceType,
        type: parsed.deliveryType,
        invalidate: true,
      });
    } catch (error) {
      // Supprimer un fichier déjà absent (ou déjà supprimé) n'est pas une
      // erreur — même contrat que `LocalStorageProvider.remove()`.
      this.logger.warn({ err: error }, `Suppression Cloudinary ignorée pour ${parsed.publicId}`);
    }
  }

  async signedUrl(key: string): Promise<string> {
    const parsed = parseKey(key);

    if (!parsed) {
      throw new Error(`Clé de stockage illisible : ${key}`);
    }

    if (parsed.deliveryType === 'upload') {
      // Un objet public n'a rien à signer : son URL directe suffit déjà.
      return cloudinary.url(parsed.publicId, {
        resource_type: parsed.resourceType,
        secure: true,
      });
    }

    return cloudinary.url(parsed.publicId, {
      resource_type: parsed.resourceType,
      type: 'authenticated',
      sign_url: true,
      secure: true,
    });
  }
}

/** Type de ressource Cloudinary : `raw` pour tout ce qui n'est pas une image. */
function resourceTypeFor(mimeType: string): 'image' | 'raw' {
  return mimeType.startsWith('image/') ? 'image' : 'raw';
}

function parseKey(
  key: string,
): {
  deliveryType: 'upload' | 'authenticated';
  resourceType: 'image' | 'raw';
  publicId: string;
} | null {
  const [deliveryType, resourceType, ...rest] = key.split('|');
  const publicId = rest.join('|');

  if (
    (deliveryType !== 'upload' && deliveryType !== 'authenticated') ||
    (resourceType !== 'image' && resourceType !== 'raw') ||
    !publicId
  ) {
    return null;
  }

  return { deliveryType, resourceType, publicId };
}

/** UUID sans tiret : les tirets sont valides dans un `public_id` Cloudinary,
 *  mais autant garder la même forme compacte que le stockage local. */
function cryptoRandomId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** Comparaison en temps constant : une signature ne se compare pas caractère par caractère. */
function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}
