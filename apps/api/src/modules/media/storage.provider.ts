import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

export interface StoredFile {
  /** Clé interne. Jamais une URL : c'est elle qui est stockée en base. */
  readonly key: string;
  /** URL de lecture. Publique pour un visuel, signée pour un document privé. */
  readonly url: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface PutObjectInput {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly originalName?: string;
  /** `events`, `organizations`, `verification`… */
  readonly folder: string;
  /**
   * Un document privé — pièce d'identité, justificatif — n'est jamais lisible
   * par URL directe.
   */
  readonly visibility: 'public' | 'private';
}

/**
 * Stockage de fichiers.
 *
 * Abstraction volontairement étroite : le passage à Cloudflare R2 consiste à
 * fournir une autre implémentation, sans toucher aux modules métier.
 */
export abstract class StorageProvider {
  abstract readonly code: string;
  abstract put(input: PutObjectInput): Promise<StoredFile>;
  abstract remove(key: string): Promise<void>;
  /** URL de lecture d'un objet privé, valable un temps limité. */
  abstract signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

/**
 * Stockage local, pour le développement.
 *
 * Les fichiers atterrissent dans un dossier servi par l'API. Refuse de
 * fonctionner en production : un disque local ne survit pas à un redéploiement
 * et ne se partage pas entre instances.
 */
@Injectable()
export class LocalStorageProvider extends StorageProvider {
  readonly code = 'local';

  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    super();

    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'Le stockage local est interdit en production : les fichiers ne survivraient pas ' +
          'à un redéploiement et ne seraient pas partagés entre instances.',
      );
    }

    this.root = join(process.cwd(), 'storage');
    this.baseUrl = `http://localhost:${config.get('PORT', { infer: true })}/${config.get('API_PREFIX', { infer: true })}/media`;
  }

  async put(input: PutObjectInput): Promise<StoredFile> {
    const extension = extensionFor(input.mimeType, input.originalName);
    const key = `${input.folder}/${randomUUID()}${extension}`;
    const target = join(this.root, key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.buffer);

    this.logger.log(`Fichier enregistré : ${key} (${input.buffer.byteLength} octets)`);

    return {
      key,
      url: `${this.baseUrl}/${key}`,
      sizeBytes: input.buffer.byteLength,
      mimeType: input.mimeType,
    };
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(join(this.root, key));
    } catch {
      // Supprimer un fichier déjà absent n'est pas une erreur.
    }
  }

  async signedUrl(key: string): Promise<string> {
    // Le stockage local ne signe rien : c'est acceptable en développement, et
    // c'est une raison de plus pour l'interdire en production.
    return Promise.resolve(`${this.baseUrl}/${key}`);
  }
}

/** Extension de fichier, déduite du type MIME plutôt que du nom fourni. */
function extensionFor(mimeType: string, originalName?: string): string {
  const known: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'application/pdf': '.pdf',
  };

  if (known[mimeType]) return known[mimeType];

  // Repli sur l'extension d'origine, restreinte à des caractères sûrs : un nom
  // de fichier fourni par un tiers ne doit jamais construire un chemin.
  const extension = originalName?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  return extension ? `.${extension.toLowerCase()}` : '';
}
