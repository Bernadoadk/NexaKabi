import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createSpotlightSchema,
  creditSpotlightBookingSchema,
  rejectSpotlightBookingSchema,
  reorderSpotlightsSchema,
  stagedUploadSchema,
  updateSpotlightSchema,
  updateSpotlightSettingsSchema,
  withdrawSpotlightSchema,
  type SpotlightBookingAdmin,
  type SpotlightVideo,
  type SpotlightVideoTicket,
  type UploadTicket,
  type UploadedMedia,
} from '@nexakabi/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { CountriesService } from '../countries/countries.service';
import { MediaIntakeService } from '../media/media-intake.service';
import { MediaService } from '../media/media.service';
import { StorageProvider } from '../media/storage.provider';
import { UPLOAD_CONTENT_TYPE } from '../media/upload.constraints';
import { SpotlightBookingsService } from '../spotlights/spotlight-bookings.service';
import { SpotlightSettingsService } from '../spotlights/spotlight-settings.service';
import { SpotlightsAdminService } from '../spotlights/spotlights-admin.service';
import {
  AdminSessionGuard,
  RequireAdminAccess,
  RequireMoney,
  type AdminRequest,
} from './admin-session.guard';

/**
 * À la une — l'espace « À la une » de la console.
 *
 * `read` : voir la une, ses mises en avant et leur bilan.
 * `act`  : ajouter, modifier, ordonner, retirer, régler.
 *
 * Les corps sont relus ici par leur schéma : ce sont eux qui convertissent les
 * dates et refusent un lien de billetterie qui ne serait pas en https.
 */
@ApiTags('Administration · à la une')
@Public()
@UseGuards(AdminSessionGuard)
@Controller('admin/spotlights')
export class AdminSpotlightsController {
  constructor(
    private readonly spotlights: SpotlightsAdminService,
    private readonly bookings: SpotlightBookingsService,
    private readonly settings: SpotlightSettingsService,
    private readonly countries: CountriesService,
    private readonly intake: MediaIntakeService,
    private readonly media: MediaService,
    private readonly storage: StorageProvider,
    private readonly audit: AuditService,
  ) {}

  @RequireAdminAccess('spotlights', 'read')
  @Get()
  @ApiOperation({ summary: 'La une : réglages, mises en avant en cours, programmées et passées' })
  overview() {
    return this.spotlights.overview();
  }

  @RequireAdminAccess('spotlights', 'read')
  @Get('events')
  @ApiOperation({ summary: 'Événements publiés à venir, pour en mettre un à la une' })
  events(@Query('q') search?: string) {
    return this.spotlights.searchEvents(search);
  }

  @RequireAdminAccess('spotlights', 'act')
  @Patch('settings')
  @ApiOperation({
    summary: 'Régler la une : nombre de diapositives, durée, mention « Sponsorisé »',
  })
  async updateSettings(@Body() body: unknown, @Req() request: AdminRequest) {
    const patch = updateSpotlightSettingsSchema.parse(body);

    // Un tarif ne se fixe que pour un pays ouvert : un code inconnu serait un
    // prix que personne ne paierait jamais.
    if (patch.pricePerDay) {
      const open = new Set((await this.countries.listActive()).map((country) => country.code));
      const unknown = Object.keys(patch.pricePerDay).filter((code) => !open.has(code));

      if (unknown.length > 0) {
        throw new BadRequestException(`Pays non ouvert : ${unknown.join(', ')}.`);
      }
    }

    const { before, after } = await this.settings.update(patch, request.admin.id);

    await this.audit.record({
      action: AUDIT_ACTIONS.settingsSpotlightsUpdated,
      actorType: 'ADMIN',
      actorUserId: request.admin.id,
      entityType: 'PlatformSetting',
      entityId: 'spotlights',
      changes: { before, after },
    });

    return after;
  }

  @RequireAdminAccess('spotlights', 'act')
  @Post('reorder')
  @ApiOperation({ summary: 'Nouvel ordre de la une' })
  async reorder(@Body() body: unknown, @Req() request: AdminRequest) {
    await this.spotlights.reorder(reorderSpotlightsSchema.parse(body).ids, request.admin.id);
    return { ok: true };
  }

  /**
   * Premier temps du dépôt d'un visuel : le ticket de dépôt direct.
   *
   * Le transit est rangé sous l'identifiant de l'administrateur : la reprise
   * vérifie qu'il relit bien son propre dépôt.
   */
  @RequireAdminAccess('spotlights', 'act')
  @Post('upload-ticket')
  @ApiOperation({ summary: 'Obtenir un ticket de dépôt direct pour un visuel' })
  uploadTicket(@Req() request: AdminRequest): Promise<UploadTicket> {
    return this.intake.createTicket(request.admin.id);
  }

  /**
   * Second temps : la référence du fichier déposé (ou le fichier lui-même, en
   * développement sans stockage). Même traitement qu'une couverture
   * d'événement — 16:9, ré-encodé en AVIF.
   */
  @RequireAdminAccess('spotlights', 'act')
  @Post('image')
  @ApiConsumes('application/json', UPLOAD_CONTENT_TYPE)
  @ApiOperation({ summary: 'Déposer le visuel d’une mise en avant' })
  async uploadImage(@Req() request: AdminRequest): Promise<UploadedMedia> {
    const file = await this.intake.receive(request, request.admin.id);

    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const result = await this.media.uploadEventCover(file.buffer, file.mimetype, 'spotlights');

    return {
      url: result.cover.url,
      thumbnailUrl: result.thumbnail.url,
      sizeBytes: result.cover.sizeBytes,
      originalSizeBytes: file.size,
    };
  }

  /**
   * Vidéo d'une diapositive : ticket de dépôt direct chez le stockage, puis
   * vérification de ce qui a été déposé (durée, poids, format).
   */
  @RequireAdminAccess('spotlights', 'act')
  @Post('video-ticket')
  @ApiOperation({ summary: 'Obtenir un ticket de dépôt direct pour une vidéo' })
  async videoTicket(@Req() request: AdminRequest): Promise<SpotlightVideoTicket> {
    const ticket = await this.storage.createVideoUploadTicket(request.admin.id);

    if (!ticket) {
      throw new BadRequestException(
        'La vidéo demande le stockage Cloudinary : renseigne CLOUDINARY_* dans la configuration de l’API.',
      );
    }

    return ticket;
  }

  @RequireAdminAccess('spotlights', 'act')
  @Post('video')
  @ApiOperation({ summary: 'Valider une vidéo déposée et obtenir ses adresses' })
  video(@Body() body: unknown, @Req() request: AdminRequest): Promise<SpotlightVideo> {
    return this.storage.confirmVideo(stagedUploadSchema.parse(body), request.admin.id);
  }

  // ── Places achetées ────────────────────────────────────────────────────────

  @RequireAdminAccess('spotlights', 'read')
  @Get('bookings/:bookingId')
  @ApiOperation({ summary: 'Une place achetée, son aperçu et son bilan' })
  booking(@Param('bookingId') bookingId: string): Promise<SpotlightBookingAdmin> {
    return this.bookings.adminGet(bookingId);
  }

  @RequireAdminAccess('spotlights', 'act')
  @Post('bookings/:bookingId/approve')
  @ApiOperation({ summary: 'Valider une place : elle sera diffusée sur ses dates' })
  approve(
    @Param('bookingId') bookingId: string,
    @Req() request: AdminRequest,
  ): Promise<SpotlightBookingAdmin> {
    return this.bookings.approve(bookingId, request.admin.id);
  }

  @RequireAdminAccess('spotlights', 'act')
  @Post('bookings/:bookingId/reject')
  @ApiOperation({ summary: 'Refuser une place : l’organisateur est remboursé sur son solde' })
  reject(
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ): Promise<SpotlightBookingAdmin> {
    const { reason } = rejectSpotlightBookingSchema.parse(body);
    return this.bookings.reject(bookingId, request.admin.id, reason);
  }

  /**
   * Geste de l'équipe : des jours rendus en avoir. De la valeur sort de la
   * plateforme — réservé à qui peut faire bouger l'argent.
   */
  @RequireAdminAccess('spotlights', 'act')
  @RequireMoney()
  @Post('bookings/:bookingId/credit')
  @ApiOperation({ summary: 'Rendre des jours en avoir (panne, incident)' })
  credit(
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ): Promise<SpotlightBookingAdmin> {
    const { days, reason } = creditSpotlightBookingSchema.parse(body);
    return this.bookings.grantCredit(bookingId, request.admin.id, days, reason);
  }

  @RequireAdminAccess('spotlights', 'act')
  @Post()
  @ApiOperation({ summary: 'Mettre un événement à la une' })
  create(@Body() body: unknown, @Req() request: AdminRequest) {
    return this.spotlights.create(createSpotlightSchema.parse(body), request.admin.id);
  }

  @RequireAdminAccess('spotlights', 'read')
  @Get(':id')
  @ApiOperation({ summary: 'Une mise en avant et son bilan' })
  get(@Param('id') id: string) {
    return this.spotlights.get(id);
  }

  @RequireAdminAccess('spotlights', 'act')
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une mise en avant' })
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) {
    return this.spotlights.update(id, updateSpotlightSchema.parse(body), request.admin.id);
  }

  /**
   * Le corps est facultatif : `{ compensate: false, reason }` ne sert qu'à une
   * place payée dont les jours restants ne doivent pas être rendus.
   */
  @RequireAdminAccess('spotlights', 'act')
  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Retirer une mise en avant de la une, tout de suite' })
  withdraw(@Param('id') id: string, @Body() body: unknown, @Req() request: AdminRequest) {
    const options = withdrawSpotlightSchema.parse(body ?? {});
    return this.spotlights.withdraw(id, request.admin.id, options);
  }
}
