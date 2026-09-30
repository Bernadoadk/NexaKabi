import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  createNewsletterCampaignSchema,
  newsletterSubscribersQuerySchema,
  sendNewsletterCampaignSchema,
  testNewsletterCampaignSchema,
  updateNewsletterCampaignSchema,
  updatePlatformNotificationSettingsSchema,
} from '@nexakabi/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { AuditService } from '../audit/audit.service';
import { PlatformSettingsService } from '../notifications/platform-settings.service';
import { NewsletterCampaignsService } from '../newsletter/newsletter-campaigns.service';
import { NewsletterSubscriptionsService } from '../newsletter/newsletter-subscriptions.service';
import { AdminSessionGuard, RequireAdminAccess, type AdminRequest } from './admin-session.guard';

class CreateCampaignDto extends createZodDto(createNewsletterCampaignSchema) {}
class UpdateCampaignDto extends createZodDto(updateNewsletterCampaignSchema) {}
class SendCampaignDto extends createZodDto(sendNewsletterCampaignSchema) {}
class TestCampaignDto extends createZodDto(testNewsletterCampaignSchema) {}
class UpdateSettingsDto extends createZodDto(updatePlatformNotificationSettingsSchema) {}

type RawQuery = Record<string, string | undefined>;

/**
 * Newsletter et réglages des envois — l'espace « Newsletter » de la console.
 *
 * `read` : consulter les abonnés, les campagnes, leurs résultats, exporter.
 * `act`  : rédiger, tester, lancer, programmer, arrêter, désabonner quelqu'un,
 *          et régler les interrupteurs globaux des envois.
 */
@ApiTags('Administration · newsletter')
@Public()
@UseGuards(AdminSessionGuard)
@Controller('admin/newsletter')
export class AdminNewsletterController {
  constructor(
    private readonly campaigns: NewsletterCampaignsService,
    private readonly subscriptions: NewsletterSubscriptionsService,
    private readonly settings: PlatformSettingsService,
    private readonly audit: AuditService,
  ) {}

  @RequireAdminAccess('newsletter', 'read')
  @Get()
  @ApiOperation({ summary: 'Vue d’ensemble : abonnés, campagnes, réglages' })
  overview() {
    return this.campaigns.overview();
  }

  // ── Abonnés ───────────────────────────────────────────────────────────────

  @RequireAdminAccess('newsletter', 'read')
  @Get('subscribers')
  @ApiOperation({ summary: 'Abonnés, filtrés' })
  subscribers(@Query() query: RawQuery) {
    return this.subscriptions.list(newsletterSubscribersQuerySchema.parse(query));
  }

  @RequireAdminAccess('newsletter', 'read')
  @Get('subscribers.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Exporter les abonnés filtrés' })
  exportSubscribers(@Query() query: RawQuery) {
    return this.subscriptions.exportCsv(newsletterSubscribersQuerySchema.parse(query));
  }

  @RequireAdminAccess('newsletter', 'act')
  @Post('subscribers/:id/unsubscribe')
  @ApiOperation({ summary: 'Désabonner une adresse, à la demande de la personne' })
  unsubscribe(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.subscriptions.unsubscribeByAdmin(id, request.admin.id);
  }

  // ── Campagnes ─────────────────────────────────────────────────────────────

  @RequireAdminAccess('newsletter', 'read')
  @Get('events')
  @ApiOperation({ summary: 'Événements à venir, pour composer une campagne' })
  events(@Query('q') search?: string) {
    return this.campaigns.searchEvents(search);
  }

  @RequireAdminAccess('newsletter', 'act')
  @Post('campaigns')
  @ApiOperation({ summary: 'Nouvelle campagne (brouillon)' })
  create(@Body() body: CreateCampaignDto, @Req() request: AdminRequest) {
    return this.campaigns.create(body, request.admin.id);
  }

  @RequireAdminAccess('newsletter', 'read')
  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Une campagne, son contenu et ses résultats' })
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @RequireAdminAccess('newsletter', 'act')
  @Patch('campaigns/:id')
  @ApiOperation({ summary: 'Modifier un brouillon ou une campagne programmée' })
  update(@Param('id') id: string, @Body() body: UpdateCampaignDto) {
    return this.campaigns.update(id, body);
  }

  @RequireAdminAccess('newsletter', 'act')
  @Delete('campaigns/:id')
  @ApiOperation({ summary: 'Supprimer un brouillon' })
  async remove(@Param('id') id: string) {
    await this.campaigns.remove(id);
    return { ok: true };
  }

  @RequireAdminAccess('newsletter', 'read')
  @Get('campaigns/:id/preview')
  @ApiOperation({ summary: 'L’e-mail tel qu’il partira' })
  preview(@Param('id') id: string) {
    return this.campaigns.preview(id);
  }

  @RequireAdminAccess('newsletter', 'act')
  @Post('campaigns/:id/test')
  @ApiOperation({ summary: 'Envoyer un test à une adresse' })
  test(@Param('id') id: string, @Body() body: TestCampaignDto, @Req() request: AdminRequest) {
    return this.campaigns.sendTest(id, body.email, request.admin.id);
  }

  @RequireAdminAccess('newsletter', 'act')
  @Post('campaigns/:id/send')
  @ApiOperation({ summary: 'Envoyer maintenant, ou programmer' })
  send(@Param('id') id: string, @Body() body: SendCampaignDto, @Req() request: AdminRequest) {
    return this.campaigns.send(id, body, request.admin.id);
  }

  @RequireAdminAccess('newsletter', 'act')
  @Post('campaigns/:id/cancel')
  @ApiOperation({ summary: 'Annuler une programmation, ou arrêter un envoi en cours' })
  cancel(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.campaigns.cancel(id, request.admin.id);
  }

  @RequireAdminAccess('newsletter', 'act')
  @Post('campaigns/:id/retry')
  @ApiOperation({ summary: 'Relancer les envois en échec' })
  retry(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.campaigns.retryFailed(id, request.admin.id);
  }

  @RequireAdminAccess('newsletter', 'act')
  @Post('campaigns/:id/duplicate')
  @ApiOperation({ summary: 'Nouvelle campagne à partir de celle-ci' })
  duplicate(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.campaigns.duplicate(id, request.admin.id);
  }

  // ── Réglages des envois ───────────────────────────────────────────────────

  @RequireAdminAccess('newsletter', 'act')
  @Patch('settings')
  @ApiOperation({ summary: 'Interrupteurs globaux : sélections, WhatsApp non urgent' })
  async updateSettings(@Body() body: UpdateSettingsDto, @Req() request: AdminRequest) {
    const { before, after } = await this.settings.updateNotificationSettings(
      body,
      request.admin.id,
    );

    await this.audit.record({
      action: 'settings.notifications.updated',
      actorType: 'ADMIN',
      actorUserId: request.admin.id,
      entityType: 'PlatformSetting',
      entityId: 'notifications',
      changes: { before, after },
    });

    return after;
  }
}
