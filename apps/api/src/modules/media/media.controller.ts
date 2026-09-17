import { BadRequestException, Controller, Post, Req } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { UploadTicket } from '@nexakabi/contracts';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { RequirePermission } from '../organizations/decorators/require-permission.decorator';
import { MediaIntakeService } from './media-intake.service';
import { MediaService } from './media.service';
import { UPLOAD_CONTENT_TYPE } from './upload.constraints';

/** Un dépôt se fait en deux temps : voir `MediaIntakeService`. */
const UPLOAD_CONSUMES = ['application/json', UPLOAD_CONTENT_TYPE];

@ApiTags('Médias')
@Controller('media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly intake: MediaIntakeService,
  ) {}

  /**
   * Premier temps d'un dépôt : le ticket avec lequel le navigateur envoie le
   * fichier directement au stockage. Sans permission particulière : le transit
   * est privé, propre au compte, et c'est la route qui CONSOMME le fichier qui
   * vérifie le droit de l'utiliser (bannière, visuel d'événement…).
   */
  @Post('upload-ticket')
  @ApiOperation({
    summary: 'Obtenir un ticket de dépôt direct',
    description:
      'Le fichier ne transite pas par l’API : le navigateur le dépose chez le stockage avec ce ' +
      'ticket signé, puis envoie la référence obtenue à la route du visuel concerné.',
  })
  createUploadTicket(@CurrentUser() user: AuthenticatedUser): Promise<UploadTicket> {
    return this.intake.createTicket(user.id);
  }

  @Post('event-cover')
  @RequirePermission('event:update')
  @ApiConsumes(...UPLOAD_CONSUMES)
  @ApiOperation({
    summary: 'Déposer un visuel de couverture',
    description:
      "L'image est ré-encodée en AVIF : le poids servi est divisé par deux à trois, et " +
      'toute charge utile dissimulée dans les métadonnées est détruite au passage.',
  })
  async uploadEventCover(@Req() request: Request, @CurrentUser() user: AuthenticatedUser) {
    const file = await this.intake.receive(request, user.id);

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
  @ApiConsumes(...UPLOAD_CONSUMES)
  @ApiOperation({
    summary: 'Déposer un plan du lieu',
    description:
      'Réduit si nécessaire, jamais recadré : les marges d’un plan sont ce qu’on vient y lire.',
  })
  async uploadEventFloorPlan(@Req() request: Request, @CurrentUser() user: AuthenticatedUser) {
    const file = await this.intake.receive(request, user.id);

    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const stored = await this.media.uploadEventFloorPlan(file.buffer, file.mimetype);

    return { url: stored.url, sizeBytes: stored.sizeBytes, originalSizeBytes: file.size };
  }

  @Post('organization-cover')
  @RequirePermission('organization:update')
  @ApiConsumes(...UPLOAD_CONSUMES)
  @ApiOperation({
    summary: 'Déposer la bannière de l’organisation',
    description: 'Même cadrage 16:9 qu’une couverture d’événement, pour la page publique.',
  })
  async uploadOrganizationCover(@Req() request: Request, @CurrentUser() user: AuthenticatedUser) {
    const file = await this.intake.receive(request, user.id);

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
  @ApiConsumes(...UPLOAD_CONSUMES)
  @ApiOperation({
    summary: 'Déposer le logo de l’organisation',
    description: 'Recadré en carré, centré sur la zone la plus chargée en détails.',
  })
  async uploadOrganizationLogo(@Req() request: Request, @CurrentUser() user: AuthenticatedUser) {
    const file = await this.intake.receive(request, user.id);

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
  @ApiConsumes(...UPLOAD_CONSUMES)
  @ApiOperation({
    summary: 'Déposer sa photo de profil',
    description: 'Un seul avatar par compte, partagé entre l’espace participant et organisateur.',
  })
  async uploadAvatar(@Req() request: Request, @CurrentUser() user: AuthenticatedUser) {
    const file = await this.intake.receive(request, user.id);

    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const stored = await this.media.uploadAvatar(file.buffer, file.mimetype);

    return { url: stored.url, sizeBytes: stored.sizeBytes, originalSizeBytes: file.size };
  }
}
