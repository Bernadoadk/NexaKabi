import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  adminLoginSchema,
  adminTotpSchema,
  createReportSchema,
  freezeFundsSchema,
  recordPayoutSchema,
  resolveReportSchema,
  reviewEventSchema,
  reviewVerificationSchema,
  suspendUserSchema,
  unfreezeFundsSchema,
  type GlobalRole,
  type PayoutStatus,
  type UserStatus,
  type VerificationStatus,
} from '@nexakabi/contracts';
import { z } from 'zod';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminOrganizationsService } from './admin-organizations.service';
import {
  AdminSessionGuard,
  AllowPendingTotp,
  MinimumAdminRole,
  type AdminRequest,
} from './admin-session.guard';
import { AdminUsersService } from './admin-users.service';
import { PayoutsService } from '../finance/payouts.service';
import { EventModerationService } from './event-moderation.service';
import { ModerationService } from './moderation.service';
import { VerificationsService } from './verifications.service';

class LoginDto extends createZodDto(adminLoginSchema) {}
class TotpDto extends createZodDto(adminTotpSchema) {}
class ReviewDto extends createZodDto(reviewVerificationSchema) {}
class ReviewEventDto extends createZodDto(reviewEventSchema) {}
class ResolveReportDto extends createZodDto(resolveReportSchema) {}
class FreezeDto extends createZodDto(freezeFundsSchema) {}
class UnfreezeDto extends createZodDto(unfreezeFundsSchema) {}
class SuspendUserDto extends createZodDto(suspendUserSchema) {}
class RecordPayoutDto extends createZodDto(recordPayoutSchema) {}
class NoteDto extends createZodDto(z.object({ body: z.string().trim().min(1).max(2_000) })) {}

/**
 * Authentification de l'administration.
 *
 * `@Public()` désactive le garde de session PARTICIPANT : l'administration a le
 * sien, et un administrateur n'est pas censé avoir de session participant
 * ouverte pour se connecter ici.
 */
@ApiTags('Administration · connexion')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Première étape : identifiants' })
  async login(@Body() body: LoginDto, @Req() request: AdminRequest) {
    return this.auth.login(body, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  /**
   * Seconde étape.
   *
   * La seule route qui accepte une session dont le TOTP n'est pas encore validé
   * — et pour cause : c'est elle qui le valide.
   */
  @Public()
  @UseGuards(AdminSessionGuard)
  @AllowPendingTotp()
  @Post('totp')
  @ApiOperation({ summary: 'Seconde étape : code à six chiffres' })
  async verifyTotp(@Body() body: TotpDto, @Req() request: AdminRequest) {
    return this.auth.verifyTotpCode(request.adminToken, body.code);
  }

  @Public()
  @UseGuards(AdminSessionGuard)
  @AllowPendingTotp()
  @Post('logout')
  @ApiOperation({ summary: 'Fermer la session' })
  async logout(@Req() request: AdminRequest) {
    await this.auth.logout(request.adminToken);
    return { ok: true };
  }

  @Public()
  @UseGuards(AdminSessionGuard)
  @Get('me')
  @ApiOperation({ summary: 'Session courante' })
  me(@Req() request: AdminRequest) {
    return request.admin;
  }
}

/**
 * Administration de la plateforme.
 *
 * ── Ce que ce contrôleur n'expose PAS ─────────────────────────────────────
 * Aucune route ne modifie un événement, n'efface une écriture du grand livre ni
 * ne change un montant encaissé. Un administrateur capable de tout réécrire
 * rendrait l'audit inutile : plus rien ne distinguerait une correction légitime
 * d'un abus.
 */
@ApiTags('Administration')
@Public()
@UseGuards(AdminSessionGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly verifications: VerificationsService,
    private readonly moderation: ModerationService,
    private readonly payouts: PayoutsService,
    private readonly events: EventModerationService,
    private readonly organizations: AdminOrganizationsService,
    private readonly users: AdminUsersService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Ce qui attend une décision' })
  dashboard() {
    return this.verifications.dashboard();
  }

  // ── Vérifications ─────────────────────────────────────────────────────────

  @Get('verifications')
  @ApiOperation({ summary: 'Dossiers en attente' })
  listVerifications() {
    return this.verifications.listPending();
  }

  @Get('verifications/:id')
  @ApiOperation({ summary: 'Un dossier de vérification' })
  getVerification(@Param('id') id: string) {
    return this.verifications.getRequest(id);
  }

  /**
   * URL signée d'une pièce déposée.
   *
   * Segment littéral `documents` avant l'identifiant : `Nest` distinguerait
   * de toute façon cette route de `verifications/:id/decision` (méthodes et
   * schémas différents), mais le nommer explicitement dit ce qu'il fait sans
   * relire le corps de la méthode.
   */
  @MinimumAdminRole('ADMIN')
  @Get('verifications/:id/documents/:documentId/url')
  @ApiOperation({ summary: 'Ouvrir une pièce déposée (URL signée, à durée limitée)' })
  getDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() request: AdminRequest,
  ) {
    return this.verifications.getDocumentUrl(id, documentId, request.admin.id);
  }

  @MinimumAdminRole('ADMIN')
  @Post('verifications/:id/decision')
  @ApiOperation({ summary: 'Statuer sur un dossier' })
  async review(@Param('id') id: string, @Body() body: ReviewDto, @Req() request: AdminRequest) {
    await this.verifications.review(id, body, request.admin.id);
    return { ok: true };
  }

  // ── Événements en attente de revue ────────────────────────────────────────

  @Get('events')
  @ApiOperation({ summary: 'Événements en attente de revue' })
  listPendingEvents() {
    return this.events.listPending();
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Un événement à examiner' })
  getPendingEvent(@Param('id') id: string) {
    return this.events.getPending(id);
  }

  @MinimumAdminRole('ADMIN')
  @Post('events/:id/decision')
  @ApiOperation({ summary: 'Publier ou refuser un événement' })
  async reviewEvent(
    @Param('id') id: string,
    @Body() body: ReviewEventDto,
    @Req() request: AdminRequest,
  ) {
    await this.events.review(id, body, request.admin.id);
    return { ok: true };
  }

  // ── Signalements ──────────────────────────────────────────────────────────

  @Get('reports')
  @ApiOperation({ summary: 'File des signalements, triée par risque' })
  listReports(@Query('statut') status?: string) {
    return this.moderation.listReports({ status });
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Un dossier de signalement' })
  getReport(@Param('id') id: string) {
    return this.moderation.getReport(id);
  }

  @Patch('reports/:id/assign')
  @ApiOperation({ summary: 'Prendre le dossier en charge' })
  async assign(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.moderation.assignReport(id, request.admin.id);
    return { ok: true };
  }

  @Post('reports/:id/notes')
  @ApiOperation({ summary: 'Ajouter une note interne' })
  async addNote(@Param('id') id: string, @Body() body: NoteDto, @Req() request: AdminRequest) {
    await this.moderation.addNote(id, request.admin.id, body.body);
    return { ok: true };
  }

  @MinimumAdminRole('ADMIN')
  @Post('reports/:id/resolution')
  @ApiOperation({ summary: 'Clore le dossier' })
  async resolveReport(
    @Param('id') id: string,
    @Body() body: ResolveReportDto,
    @Req() request: AdminRequest,
  ) {
    await this.moderation.resolveReport(id, body, request.admin.id);
    return { ok: true };
  }

  // ── Organisations ─────────────────────────────────────────────────────────

  @Get('organizations')
  @ApiOperation({ summary: 'Organisations de la plateforme' })
  listOrganizations(
    @Query('q') search?: string,
    @Query('statut') verificationStatus?: VerificationStatus,
    @Query('gel') frozen?: string,
  ) {
    return this.organizations.list({
      search,
      verificationStatus,
      payoutFrozen: frozen === undefined ? undefined : frozen === 'true',
    });
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Fiche d’une organisation' })
  getOrganization(@Param('id') id: string) {
    return this.organizations.getOne(id);
  }

  @Get('organizations/:id/audit')
  @ApiOperation({ summary: 'Journal d’activité de l’organisation' })
  getOrganizationAudit(@Param('id') id: string) {
    return this.organizations.listAudit(id);
  }

  // ── Utilisateurs ──────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Comptes de la plateforme' })
  listUsers(
    @Query('q') search?: string,
    @Query('role') globalRole?: GlobalRole,
    @Query('statut') status?: UserStatus,
  ) {
    return this.users.list({ search, globalRole, status });
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Fiche d’un compte' })
  getUser(@Param('id') id: string) {
    return this.users.getOne(id);
  }

  @MinimumAdminRole('SUPERADMIN')
  @Post('users/:id/suspend')
  @ApiOperation({ summary: 'Suspendre un compte' })
  async suspendUser(
    @Param('id') id: string,
    @Body() body: SuspendUserDto,
    @Req() request: AdminRequest,
  ) {
    await this.users.suspend(id, body.reason, request.admin.id);
    return { ok: true };
  }

  @MinimumAdminRole('SUPERADMIN')
  @Post('users/:id/reactivate')
  @ApiOperation({ summary: 'Réactiver un compte suspendu' })
  async reactivateUser(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.users.reactivate(id, request.admin.id);
    return { ok: true };
  }

  // ── Retraits ──────────────────────────────────────────────────────────────

  @Get('payouts')
  @ApiOperation({ summary: 'Retraits, toutes organisations confondues' })
  listPayouts(@Query('statut') status?: PayoutStatus) {
    return this.payouts.listAll({ status });
  }

  /**
   * Exécute un versement chez l'opérateur.
   *
   * ── Pourquoi cette route est ici et pas côté organisateur ───────────────
   * Un organisateur DEMANDE un retrait ; c'est la plateforme qui le verse, après
   * avoir vérifié qu'aucun signalement n'est en cours et que le solde est réel.
   * Exposer le déclenchement dans l'espace organisateur reviendrait à lui
   * laisser se payer lui-même.
   */
  @MinimumAdminRole('SUPERADMIN')
  @Post('payouts/:id/execute')
  @ApiOperation({ summary: 'Verser les recettes chez l’opérateur' })
  executePayout(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.payouts.execute(id, request.admin.id);
  }

  /**
   * Consigne un versement fait hors plateforme.
   *
   * Un virement bancaire ne passe par aucun opérateur : il se fait depuis la
   * banque et s'enregistre ici, avec sa référence. Même rang que l'exécution —
   * c'est le même pouvoir, celui de déclarer que l'argent est parti.
   */
  @MinimumAdminRole('SUPERADMIN')
  @Post('payouts/:id/record')
  @ApiOperation({ summary: 'Enregistrer un versement fait à la main' })
  recordPayout(
    @Param('id') id: string,
    @Body() body: RecordPayoutDto,
    @Req() request: AdminRequest,
  ) {
    return this.payouts.recordManual(id, body, request.admin.id);
  }

  // ── Fonds ─────────────────────────────────────────────────────────────────

  @MinimumAdminRole('SUPERADMIN')
  @Post('organizations/:id/freeze')
  @ApiOperation({ summary: 'Geler les fonds disponibles' })
  freeze(@Param('id') id: string, @Body() body: FreezeDto, @Req() request: AdminRequest) {
    return this.moderation.freezeFunds(id, body, request.admin.id);
  }

  @MinimumAdminRole('SUPERADMIN')
  @Post('organizations/:id/unfreeze')
  @ApiOperation({ summary: 'Lever un gel' })
  unfreeze(@Param('id') id: string, @Body() body: UnfreezeDto, @Req() request: AdminRequest) {
    return this.moderation.unfreezeFunds(id, body, request.admin.id);
  }
}

/**
 * Dépôt d'un signalement, côté public.
 *
 * ── Pourquoi la session est facultative ───────────────────────────────────
 * Quelqu'un qui a acheté sans créer de compte — le cas nominal — doit pouvoir
 * signaler une escroquerie. Exiger une inscription à ce moment-là filtrerait
 * précisément les signalements les plus utiles.
 */
class CreateReportDto extends createZodDto(createReportSchema) {}

@ApiTags('Signalement')
@Controller('reports')
export class PublicReportsController {
  constructor(private readonly moderation: ModerationService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Signaler un événement, une organisation ou un compte' })
  create(@Body() body: CreateReportDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.moderation.createReport(body, user?.id);
  }
}
