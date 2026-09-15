import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { Env } from '../../config/env';
import { PutObjectInput, StorageProvider, type StoredFile } from './storage.provider';

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

  constructor(config: ConfigService<Env, true>) {
    super();

    cloudinary.config({
      cloud_name: config.get('CLOUDINARY_CLOUD_NAME', { infer: true }),
      api_key: config.get('CLOUDINARY_API_KEY', { infer: true }),
      api_secret: config.get('CLOUDINARY_API_SECRET', { infer: true }),
      secure: true,
    });
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
): { deliveryType: 'upload' | 'authenticated'; resourceType: 'image' | 'raw'; publicId: string } | null {
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
