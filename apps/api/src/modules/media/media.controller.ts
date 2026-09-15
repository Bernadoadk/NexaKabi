import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../organizations/decorators/require-permission.decorator';
import { SINGLE_FILE_UPLOAD } from './upload.constraints';
import { MediaService } from './media.service';

interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@ApiTags('Médias')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('event-cover')
  @RequirePermission('event:update')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Déposer un visuel de couverture',
    description:
      "L'image est ré-encodée en AVIF : le poids servi est divisé par deux à trois, et " +
      'toute charge utile dissimulée dans les métadonnées est détruite au passage.',
  })
  async uploadEventCover(@UploadedFile() file: UploadedFileLike | undefined) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const result = await this.media.uploadEventCover(file.buffer, file.mimetype);

    return {
      url: result.cover.url,
      thumbnailUrl: result.thumbnail.url,
      sizeBytes: result.cover.sizeBytes,
      originalSizeBytes: file.size,
    };
  }

  @Post('event-floor-plan')
  @RequirePermission('event:update')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Déposer un plan du lieu',
    description:
      'Réduit si nécessaire, jamais recadré : les marges d’un plan sont ce qu’on vient y lire.',
  })
  async uploadEventFloorPlan(@UploadedFile() file: UploadedFileLike | undefined) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const stored = await this.media.uploadEventFloorPlan(file.buffer, file.mimetype);

    return { url: stored.url, sizeBytes: stored.sizeBytes, originalSizeBytes: file.size };
  }

  @Post('organization-cover')
  @RequirePermission('organization:update')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Déposer la bannière de l’organisation',
    description: 'Même cadrage 16:9 qu’une couverture d’événement, pour la page publique.',
  })
  async uploadOrganizationCover(@UploadedFile() file: UploadedFileLike | undefined) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const result = await this.media.uploadOrganizationCover(file.buffer, file.mimetype);

    return {
      url: result.cover.url,
      thumbnailUrl: result.thumbnail.url,
      sizeBytes: result.cover.sizeBytes,
      originalSizeBytes: file.size,
    };
  }

  @Post('organization-logo')
  @RequirePermission('organization:update')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Déposer le logo de l’organisation',
    description: 'Recadré en carré, centré sur la zone la plus chargée en détails.',
  })
  async uploadOrganizationLogo(@UploadedFile() file: UploadedFileLike | undefined) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const stored = await this.media.uploadOrganizationLogo(file.buffer, file.mimetype);

    return { url: stored.url, sizeBytes: stored.sizeBytes, originalSizeBytes: file.size };
  }

  /**
   * Photo de profil du compte — sans `@RequirePermission` : elle ne dépend
   * d'aucune organisation, seulement d'une session valide (garde global). Un
   * participant qui n'a jamais créé d'organisation doit pouvoir déposer la
   * sienne tout autant qu'un organisateur.
   */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Déposer sa photo de profil',
    description: 'Un seul avatar par compte, partagé entre l’espace participant et organisateur.',
  })
  async uploadAvatar(@UploadedFile() file: UploadedFileLike | undefined) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const stored = await this.media.uploadAvatar(file.buffer, file.mimetype);

    return { url: stored.url, sizeBytes: stored.sizeBytes, originalSizeBytes: file.size };
  }
}
