import { BadRequestException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { stagedUploadSchema, type UploadTicket } from '@nexakabi/contracts';
import { StorageProvider } from './storage.provider';
import {
  UPLOAD_CONTENT_TYPE,
  UPLOAD_MAX_BYTES,
  UPLOAD_NAME_HEADER,
  UPLOAD_TYPE_HEADER,
} from './upload.constraints';

/** Même forme que le fichier multer d'autrefois : les services n'ont pas bougé. */
export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Réception d'un fichier, quelle que soit la route qu'il a prise.
 *
 * Deux formes de requête aboutissent au même `UploadedFileLike` :
 *
 *  · **Référence de transit** (JSON) — le navigateur a déposé le fichier
 *    directement chez le fournisseur avec un ticket signé, et n'envoie ici que
 *    de quoi le retrouver. C'est la voie normale : voir `@nexakabi/contracts`,
 *    `media.ts`, pour la raison (Vercel plafonne à 4,5 Mo tout ce qui passe
 *    par une fonction).
 *  · **Corps brut** (`application/octet-stream`) — le fichier lui-même, relayé
 *    par le web quand aucun fournisseur n'est configuré (développement). Ses
 *    limites sont posées par le parseur de `main.ts`.
 *
 * Dans les deux cas, ce qui suit ne change pas : le contenu réel décide du
 * type, et tout est ré-encodé (`MediaService`).
 */
@Injectable()
export class MediaIntakeService {
  constructor(private readonly storage: StorageProvider) {}

  /** Ticket de dépôt pour `ownerId` — direct si le fournisseur sait faire, relais sinon. */
  async createTicket(ownerId: string): Promise<UploadTicket> {
    const direct = await this.storage.createUploadTicket(ownerId);
    return direct ?? { mode: 'relay', maxBytes: UPLOAD_MAX_BYTES };
  }

  /** `undefined` quand la requête ne porte ni référence ni fichier. */
  async receive(request: Request, ownerId: string): Promise<UploadedFileLike | undefined> {
    const body: unknown = request.body;

    if (Buffer.isBuffer(body)) {
      return {
        buffer: body,
        mimetype: request.header(UPLOAD_TYPE_HEADER) || UPLOAD_CONTENT_TYPE,
        originalname: decodeName(request.header(UPLOAD_NAME_HEADER)),
        size: body.byteLength,
      };
    }

    if (!isPlainObject(body) || Object.keys(body).length === 0) return undefined;

    const parsed = stagedUploadSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException('Référence de fichier illisible. Réessaie le dépôt.');
    }

    const staged = await this.storage.takeStaged(parsed.data, ownerId);

    return {
      buffer: staged.buffer,
      mimetype: parsed.data.type || UPLOAD_CONTENT_TYPE,
      originalname: parsed.data.name ?? '',
      size: staged.sizeBytes,
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeName(value: string | undefined): string {
  if (!value) return '';

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
