import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { sniffFileType, type SniffedType } from './sniff';
import { StorageProvider, type StoredFile } from './storage.provider';
import { UPLOAD_MAX_BYTES } from './upload.constraints';

/** Types acceptés pour un visuel. Le reste est refusé, quel que soit le nom du fichier. */
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/**
 * 10 Mo en entrée : la conversion réduira fortement le poids servi.
 *
 * La même valeur borne le dépôt en amont — ticket de dépôt direct, ou parseur
 * du relais (`upload.constraints.ts`) : ce contrôle-ci ne voit que des tampons
 * déjà bornés, il reste néanmoins pour les appels qui ne passent pas par une
 * requête HTTP.
 */
const MAX_UPLOAD_BYTES = UPLOAD_MAX_BYTES;

/** Couverture 16:9. Le prototype demande 1600×900 au minimum. */
const COVER_WIDTH = 1600;
const COVER_HEIGHT = 900;

/** Plus grand côté d'un plan du lieu. Assez pour zoomer sur une légende. */
const FLOOR_PLAN_MAX_SIDE = 2400;

/**
 * Photo de profil — logo d'organisation ou avatar d'utilisateur.
 *
 * 480 px de côté : net jusqu'à l'avatar `xl` du design system (64 px) sur un
 * écran à densité ×7, largement au-delà de ce qu'un téléphone affiche jamais.
 * Le carré vient du CADRAGE (`cover`, centré) : la source n'a pas besoin
 * d'être carrée, seul le résultat l'est.
 */
const SQUARE_SIZE = 480;
const SQUARE_MIN_SOURCE = 200;

export interface UploadedImage {
  readonly cover: StoredFile;
  readonly thumbnail: StoredFile;
}

/**
 * Médias.
 *
 * Deux règles de sécurité, appliquées sans exception :
 *
 *  1. Le type est déterminé par le CONTENU, pas par le nom ni par l'en-tête
 *     déclaré : un `.jpg` peut contenir n'importe quoi.
 *  2. Toute image est RÉ-ENCODÉE. Cela détruit d'éventuelles charges utiles
 *     dissimulées dans les métadonnées, et sert au passage la cible de poids.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly storage: StorageProvider) {}

  /**
   * Traite un visuel d'événement.
   *
   * Sortie en AVIF : à qualité perçue égale, le fichier pèse deux à trois fois
   * moins qu'un JPEG. Sur une connexion 3G et un forfait limité, c'est la
   * différence entre une page qui s'affiche et une page qu'on abandonne.
   */
  async uploadEventCover(
    buffer: Buffer,
    declaredMimeType: string,
    folder = 'events',
  ): Promise<UploadedImage> {
    return this.processCover(buffer, declaredMimeType, folder);
  }

  /**
   * Bannière de la page publique d'une organisation.
   *
   * Même cadrage 16:9 qu'une couverture d'événement — même page de la
   * découverte, même besoin : une image large, jamais recadrée à la main.
   */
  async uploadOrganizationCover(buffer: Buffer, declaredMimeType: string): Promise<UploadedImage> {
    return this.processCover(buffer, declaredMimeType, 'organizations/covers');
  }

  private async processCover(
    buffer: Buffer,
    declaredMimeType: string,
    folder: string,
  ): Promise<UploadedImage> {
    this.assertAcceptable(buffer, declaredMimeType);

    const image = sharp(buffer, { failOn: 'error' });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException("Ce fichier n'est pas une image exploitable.");
    }

    if (metadata.width < 800) {
      throw new BadRequestException(
        `Image trop petite (${metadata.width} px de large). Il en faut 1600 pour rester nette.`,
      );
    }

    const cover = await sharp(buffer)
      .rotate() // applique l'orientation EXIF avant de la supprimer
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover', position: 'attention' })
      .avif({ quality: 62 })
      .toBuffer();

    const thumbnail = await sharp(buffer)
      .rotate()
      .resize(480, 270, { fit: 'cover', position: 'attention' })
      .avif({ quality: 55 })
      .toBuffer();

    this.logger.log(
      `Visuel converti : ${Math.round(buffer.byteLength / 1024)} Ko → ` +
        `${Math.round(cover.byteLength / 1024)} Ko (AVIF)`,
    );

    const [storedCover, storedThumbnail] = await Promise.all([
      this.storage.put({
        buffer: cover,
        mimeType: 'image/avif',
        folder,
        visibility: 'public',
      }),
      this.storage.put({
        buffer: thumbnail,
        mimeType: 'image/avif',
        folder: `${folder}/thumbnails`,
        visibility: 'public',
      }),
    ]);

    return { cover: storedCover, thumbnail: storedThumbnail };
  }

  /**
   * Logo d'organisation — sa photo de profil, affichée partout où elle
   * apparaît (en-tête de l'espace organisateur, page publique, billets).
   */
  async uploadOrganizationLogo(buffer: Buffer, declaredMimeType: string): Promise<StoredFile> {
    return this.processSquare(buffer, declaredMimeType, 'organizations/logos');
  }

  /**
   * Photo de profil d'un compte — participant ou organisateur, c'est le même
   * compte (voir la refonte de la connexion) : un seul avatar, partagé entre
   * les deux espaces.
   */
  async uploadAvatar(buffer: Buffer, declaredMimeType: string): Promise<StoredFile> {
    return this.processSquare(buffer, declaredMimeType, 'users/avatars');
  }

  private async processSquare(
    buffer: Buffer,
    declaredMimeType: string,
    folder: string,
  ): Promise<StoredFile> {
    this.assertAcceptable(buffer, declaredMimeType);

    const image = sharp(buffer, { failOn: 'error' });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException("Ce fichier n'est pas une image exploitable.");
    }

    if (metadata.width < SQUARE_MIN_SOURCE || metadata.height < SQUARE_MIN_SOURCE) {
      throw new BadRequestException(
        `Image trop petite (${metadata.width}×${metadata.height} px). Il en faut au moins ` +
          `${SQUARE_MIN_SOURCE}×${SQUARE_MIN_SOURCE}.`,
      );
    }

    const square = await sharp(buffer)
      .rotate()
      // `attention` cadre sur la zone la plus riche en détails — un visage,
      // le plus souvent — plutôt que sur le centre géométrique brut.
      .resize(SQUARE_SIZE, SQUARE_SIZE, { fit: 'cover', position: 'attention' })
      .avif({ quality: 62 })
      .toBuffer();

    this.logger.log(
      `Photo de profil convertie : ${Math.round(buffer.byteLength / 1024)} Ko → ` +
        `${Math.round(square.byteLength / 1024)} Ko (AVIF)`,
    );

    return this.storage.put({
      buffer: square,
      mimeType: 'image/avif',
      folder,
      visibility: 'public',
    });
  }

  /**
   * Dépose un plan du lieu.
   *
   * ── Pourquoi ce n'est pas la même chose qu'une couverture ───────────────
   * Une couverture se recadre en 16:9 sans perdre son sens. Un plan, non : les
   * stands du bord, la sortie de secours, la scène — tout ce qui est aux marges
   * est précisément ce qu'on vient y chercher. Le plan est donc réduit si
   * besoin, jamais recadré, et gardé net : la qualité monte d'un cran, parce
   * qu'un texte de légende illisible rend le plan inutile.
   */
  async uploadEventFloorPlan(buffer: Buffer, declaredMimeType: string): Promise<StoredFile> {
    const actual = this.assertAcceptable(buffer, declaredMimeType);

    const image = sharp(buffer, { failOn: 'error' });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException("Ce fichier n'est pas une image exploitable.");
    }

    if (metadata.width < 600 && metadata.height < 600) {
      throw new BadRequestException(
        `Plan trop petit (${metadata.width}×${metadata.height} px). Il en faut 600 au moins ` +
          'pour rester lisible.',
      );
    }

    const plan = await sharp(buffer)
      .rotate()
      // `withoutEnlargement` : un petit plan n'est pas agrandi, ce qui le
      // rendrait flou ; `inside` : réduit pour tenir dans la boîte, sans
      // rien couper.
      .resize(FLOOR_PLAN_MAX_SIDE, FLOOR_PLAN_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .avif({ quality: 72 })
      .toBuffer();

    this.logger.log(
      `Plan converti (${actual}) : ${Math.round(buffer.byteLength / 1024)} Ko → ` +
        `${Math.round(plan.byteLength / 1024)} Ko (AVIF)`,
    );

    return this.storage.put({
      buffer: plan,
      mimeType: 'image/avif',
      folder: 'events/plans',
      visibility: 'public',
    });
  }

  /**
   * Dépose une pièce de vérification.
   *
   * Ces fichiers contiennent des pièces d'identité : ils sont stockés en privé
   * et ne sont lisibles que par une URL signée, à durée limitée.
   */
  async uploadVerificationDocument(
    buffer: Buffer,
    mimeType: string,
    originalName?: string,
    options?: { allowPdf?: boolean },
  ): Promise<StoredFile> {
    // Un selfie ou une pièce d'identité se photographie : le PDF n'y a rien à
    // faire, et l'exclure retire d'un coup toute une famille de contenus
    // qu'il faudrait autrement se fier à ne pas ouvrir.
    const accepted = new Set<string>(
      options?.allowPdf === false
        ? [...ACCEPTED_IMAGE_TYPES]
        : [...ACCEPTED_IMAGE_TYPES, 'application/pdf'],
    );

    if (buffer.byteLength === 0) {
      throw new BadRequestException('Fichier vide.');
    }

    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Fichier trop lourd. 10 Mo au maximum.');
    }

    /**
     * Le type réel décide, pas le type annoncé.
     *
     * C'est ici que la nuance comptait le plus : une image finit ré-encodée par
     * `sharp`, qui refuse ce qui n'est pas une image. Un PDF, lui, était
     * conservé OCTET POUR OCTET sur la seule foi de l'en-tête déclaré — donc
     * n'importe quel contenu, stocké puis servi plus tard sous ce type à un
     * administrateur qui l'ouvrirait en confiance.
     */
    const actual = sniffFileType(buffer);

    if (!actual || !accepted.has(actual)) {
      throw new BadRequestException(
        accepted.has('application/pdf')
          ? 'Formats acceptés : JPG, PNG, WebP, AVIF ou PDF.'
          : 'Cette pièce se photographie : JPG, PNG, WebP ou AVIF.',
      );
    }

    if (actual !== mimeType) {
      this.logger.warn(`Pièce déposée : type déclaré « ${mimeType} », contenu réel « ${actual} »`);
    }

    const isImage = ACCEPTED_IMAGE_TYPES.has(actual);

    // Une image est ré-encodée ; un PDF est conservé tel quel mais reste privé.
    const payload = isImage
      ? await sharp(buffer).rotate().jpeg({ quality: 82 }).toBuffer()
      : buffer;

    return this.storage.put({
      buffer: payload,
      mimeType: isImage ? 'image/jpeg' : actual,
      originalName,
      folder: 'verification',
      visibility: 'private',
    });
  }

  /**
   * Détruit un fichier sans faire échouer l'appelant.
   *
   * ── Pourquoi « quietly » ────────────────────────────────────────────────
   * Cette méthode sert à effacer ce qui ne doit plus exister : la pièce
   * d'identité d'un dossier tranché, le selfie flou qu'on vient de reprendre.
   * Si le stockage ne répond pas, faire échouer l'opération appelante ferait
   * pire — la décision de vérification serait perdue, et le fichier resterait
   * quand même. On note, on continue, et la ligne en base garde sa date de
   * purge : c'est elle qui dit quoi reprendre.
   */
  async removeQuietly(key: string): Promise<boolean> {
    try {
      await this.storage.remove(key);
      return true;
    } catch (error) {
      this.logger.error(
        `Fichier « ${key} » non détruit : ${error instanceof Error ? error.message : 'cause inconnue'}`,
      );
      return false;
    }
  }

  /**
   * Contrôle d'entrée d'un visuel.
   *
   * ── Le type vient du CONTENU, jamais de la déclaration ──────────────────
   * `declaredMimeType` est recopié par multer du `Content-Type` annoncé par le
   * client : le croire revient à laisser l'appelant choisir la catégorie sous
   * laquelle son fichier sera rangé, converti et servi. Seuls les octets font
   * foi ici ; la déclaration n'est plus qu'un indice, et sa divergence est un
   * signal en soi.
   */
  private assertAcceptable(buffer: Buffer, declaredMimeType: string): SniffedType {
    if (buffer.byteLength === 0) {
      throw new BadRequestException('Fichier vide.');
    }

    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Image trop lourde. 10 Mo au maximum.');
    }

    const actual = sniffFileType(buffer);

    if (!actual || !ACCEPTED_IMAGE_TYPES.has(actual)) {
      throw new BadRequestException('Formats acceptés : JPG, PNG, WebP ou AVIF.');
    }

    if (actual !== declaredMimeType) {
      this.logger.warn(`Type déclaré « ${declaredMimeType} », contenu réel « ${actual} »`);
    }

    return actual;
  }
}
