import { Body, Controller, Get, Header, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AssignedEvent,
  CheckInConflictView,
  CheckInEntry,
  CheckInStats,
  EventStaffMember,
  Manifest,
  SyncScansResult,
} from '@nexakabi/contracts';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { CurrentOrg } from '../organizations/decorators/current-org.decorator';
import { RequirePermission } from '../organizations/decorators/require-permission.decorator';
import type { OrgContext } from '../organizations/guards/org-member.guard';
import { CheckInService } from './checkin.service';
import { ManifestService } from './manifest.service';
import { RevokeCheckInDto, SyncScansDto } from './dto/checkin.dto';

/**
 * Événements que le contrôleur peut scanner.
 *
 * Séparé du contrôleur principal parce qu'il ne porte pas d'`eventId` : c'est
 * l'écran qui SERT à en choisir un. La protection vient de la session, et la
 * portée du calcul — un bénévole ne voit que ce à quoi il est assigné.
 */
@ApiTags('Contrôle à l’entrée')
@Controller('checkin/events')
export class ScannerEventsController {
  constructor(private readonly checkIn: CheckInService) {}

  @Get()
  @ApiOperation({ summary: 'Événements assignés au contrôleur' })
  async assigned(@CurrentUser() user: AuthenticatedUser): Promise<AssignedEvent[]> {
    return this.checkIn.assignedEvents(user.id);
  }
}

/**
 * Contrôle à l'entrée.
 *
 * Toutes les routes sont protégées par `checkin:scan`, une permission portée
 * par le rôle CONTRÔLEUR — qui ne voit rien d'autre que le scanner de
 * l'événement auquel il est assigné. Un bénévole recruté pour la soirée ne doit
 * accéder ni aux finances, ni aux coordonnées complètes des participants.
 */
@ApiTags('Contrôle à l’entrée')
@Controller('checkin/events/:eventId')
export class CheckInController {
  constructor(
    private readonly checkIn: CheckInService,
    private readonly manifest: ManifestService,
  ) {}

  /**
   * Carnet de l'événement.
   *
   * Répond `304` si le client détient déjà la version courante : un contrôleur
   * qui rouvre son scanner ne retélécharge pas 72 Ko pour rien, ce qui compte
   * sur un forfait de données béninois.
   */
  @RequirePermission('checkin:scan')
  @Get('manifest')
  @Header('Cache-Control', 'no-cache, private')
  @ApiOperation({ summary: 'Carnet de contrôle, signé et minimisé' })
  async getManifest(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
    @Headers('if-none-match') knownVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Manifest | undefined> {
    const manifest = await this.manifest.build(
      eventId,
      context.organizationId,
      normalizeEtag(knownVersion),
    );

    if (!manifest) {
      response.status(304);
      return undefined;
    }

    response.setHeader('ETag', `"${manifest.version}"`);
    return manifest;
  }

  /**
   * Synchronisation d'un lot de scans.
   *
   * Idempotente par `nonce` : un lot renvoyé après une coupure réseau ne crée
   * aucun doublon. La file du contrôleur n'est jamais purgée avant cette
   * réponse.
   */
  @RequirePermission('checkin:scan')
  @Post('scans')
  @ApiOperation({ summary: 'Envoyer un lot de scans' })
  async sync(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
    @Body() body: SyncScansDto,
  ): Promise<SyncScansResult> {
    return this.checkIn.sync(
      { userId: user.id, eventId, organizationId: context.organizationId },
      body.scans,
    );
  }

  @RequirePermission('checkin:scan')
  @Get('stats')
  @ApiOperation({ summary: 'Compteurs d’entrée' })
  async stats(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
  ): Promise<CheckInStats> {
    return this.checkIn.stats(eventId, context.organizationId);
  }

  @RequirePermission('checkin:scan')
  @Get('history')
  @ApiOperation({ summary: 'Historique des entrées' })
  async history(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
    @Query('limit') limit?: string,
  ): Promise<CheckInEntry[]> {
    const parsed = Number(limit);

    return this.checkIn.history(
      eventId,
      context.organizationId,
      Number.isFinite(parsed) ? Math.min(parsed, 500) : 100,
    );
  }

  /**
   * Annule une entrée.
   *
   * Réservée à `checkin:override` : autoriser un contrôleur bénévole à annuler
   * une entrée ouvrirait la porte au passage d'un même billet plusieurs fois.
   */
  @RequirePermission('checkin:override')
  @Post('scans/:checkInId/revoke')
  @ApiOperation({ summary: 'Annuler une entrée' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
    @Param('checkInId') checkInId: string,
    @Body() body: RevokeCheckInDto,
  ): Promise<CheckInEntry> {
    return this.checkIn.revoke(eventId, context.organizationId, checkInId, user.id, body.reason);
  }

  /**
   * Équipe de contrôle et activité de chacun.
   *
   * `member:read`, que le rôle Contrôleur n'a pas : un bénévole ne voit ni la
   * liste ni les numéros des autres. L'organisateur, lui, en a besoin après la
   * soirée — pour payer ceux qui ont tenu les portes.
   */
  @RequirePermission('member:read')
  @Get('staff')
  @ApiOperation({ summary: 'Équipe de contrôle de l’événement' })
  async staff(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
  ): Promise<EventStaffMember[]> {
    return this.checkIn.staff(eventId, context.organizationId);
  }

  /**
   * Conflits de double scan.
   *
   * Destinés à l'ORGANISATEUR, jamais au contrôleur : celui-ci ne peut rien y
   * faire pendant l'événement, et le lui montrer ne ferait que le ralentir.
   */
  @RequirePermission('attendee:read')
  @Get('conflicts')
  @ApiOperation({ summary: 'Doubles scans détectés' })
  async conflicts(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
  ): Promise<CheckInConflictView[]> {
    return this.checkIn.conflicts(eventId, context.organizationId);
  }
}

/** Les `ETag` HTTP arrivent entre guillemets, parfois préfixés `W/`. */
function normalizeEtag(value: string | undefined): string | undefined {
  return value?.replace(/^W\//, '').replace(/"/g, '').trim() || undefined;
}
