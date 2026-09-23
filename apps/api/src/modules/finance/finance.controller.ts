import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ORG_ROLE_DEFINITIONS,
  type Balance,
  type LedgerEntry,
  type OrganizationStats,
  type Payout,
  type PayoutMethods,
} from '@nexakabi/contracts';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { CurrentOrg } from '../organizations/decorators/current-org.decorator';
import { RequirePermission } from '../organizations/decorators/require-permission.decorator';
import type { OrgContext } from '../organizations/guards/org-member.guard';
import { PaymentRoutingService } from '../payments/payment-routing.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { PayoutsService } from './payouts.service';
import { StatsService } from './stats.service';
import { QuotePayoutDto, RequestPayoutDto } from './dto/finance.dto';

/**
 * Finances de l'organisation.
 *
 * Deux permissions distinctes, et la distinction compte : `finance:read` laisse
 * consulter le solde — un comptable, un associé —, `payout:request` autorise à
 * SORTIR l'argent. Les confondre reviendrait à donner les clés de la caisse à
 * quiconque peut lire un rapport.
 */
@ApiTags('Finances')
@Controller('organizer/finance')
export class FinanceController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly payouts: PayoutsService,
    private readonly stats: StatsService,
    private readonly routing: PaymentRoutingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Moyens de réception que cette organisation peut enregistrer.
   *
   * Ceux que SON pays autorise en versement — et rien d'autre. Un organisateur
   * ivoirien voit Wave et Orange Money, pas Celtiis : la liste vient de la
   * configuration du pays, jamais d'une constante.
   */
  @RequirePermission('finance:read')
  @Get('payout-methods')
  @ApiOperation({ summary: 'Moyens de réception disponibles pour les retraits' })
  async payoutMethods(@CurrentOrg() context: OrgContext): Promise<PayoutMethods> {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { countryCode: true },
    });

    return this.routing.listPayoutMethods(organization.countryCode);
  }

  @RequirePermission('finance:read')
  @Get('balance')
  @ApiOperation({ summary: 'Solde et cumuls' })
  async balance(@CurrentOrg() context: OrgContext): Promise<Balance> {
    return this.ledger.balance(context.organizationId);
  }

  @RequirePermission('finance:read')
  @Get('statement')
  @ApiOperation({ summary: 'Relevé détaillé' })
  async statement(
    @CurrentOrg() context: OrgContext,
    @Query('limit') limit?: string,
  ): Promise<LedgerEntry[]> {
    const parsed = Number(limit);
    return this.ledger.statement(
      context.organizationId,
      Number.isFinite(parsed) ? Math.min(parsed, 500) : 100,
    );
  }

  @RequirePermission('finance:read')
  @Get('payouts')
  @ApiOperation({ summary: 'Historique des retraits' })
  async listPayouts(@CurrentOrg() context: OrgContext): Promise<Payout[]> {
    return this.payouts.list(context.organizationId);
  }

  /**
   * Simulation, avant validation.
   *
   * Le net exact est affiché AVANT que l'organisateur ne confirme : découvrir
   * les frais après coup est la première cause de défiance.
   *
   * ⚠ Déclarée AVANT `payouts/:payoutId` : Nest résout les routes dans l'ordre
   * de déclaration, et le paramètre capterait sinon le segment « quote ».
   */
  @RequirePermission('payout:request')
  @Get('payouts/quote')
  @ApiOperation({ summary: 'Simuler un retrait' })
  async quote(@CurrentOrg() context: OrgContext, @Query() query: QuotePayoutDto) {
    return this.payouts.quote(context.organizationId, query.amount);
  }

  @RequirePermission('finance:read')
  @Get('payouts/:payoutId')
  @ApiOperation({ summary: 'Détail d’un retrait' })
  async findPayout(
    @CurrentOrg() context: OrgContext,
    @Param('payoutId') payoutId: string,
  ): Promise<Payout> {
    return this.payouts.findOne(context.organizationId, payoutId);
  }

  /**
   * Statistiques consolidées, tous événements de l'organisation confondus.
   *
   * Le segment littéral `organization` exclut toute collision avec
   * `events/:eventId/stats` : les deux routes ne peuvent pas se capter l'une
   * l'autre, dans quelque ordre qu'elles soient déclarées.
   */
  @RequirePermission('stats:read')
  @Get('organization/stats')
  @ApiOperation({ summary: 'Statistiques consolidées de l’organisation' })
  async organizationStats(@CurrentOrg() context: OrgContext): Promise<OrganizationStats> {
    return this.stats.forOrganization(context.organizationId);
  }

  /**
   * Statistiques d'un événement (écran O9).
   *
   * La recette nette est LUE au grand livre, jamais recalculée : deux sources
   * de vérité pour un même montant finiraient par diverger, et l'écart se
   * verrait sur l'écran d'un organisateur.
   */
  @RequirePermission('stats:read')
  @Get('events/:eventId/stats')
  @ApiOperation({ summary: 'Statistiques d’un événement' })
  async eventStats(@CurrentOrg() context: OrgContext, @Param('eventId') eventId: string) {
    return this.stats.forEvent(context.organizationId, eventId);
  }

  /**
   * Liste des participants (écran O6).
   *
   * `attendee:read` suffit à consulter ; l'export, lui, exige `attendee:export`.
   * La distinction n'est pas cosmétique : emporter la liste dans un fichier est
   * un acte différent de la consulter à l'écran.
   */
  @RequirePermission('attendee:read')
  @Get('events/:eventId/attendees')
  @ApiOperation({ summary: 'Participants d’un événement' })
  async attendees(@CurrentOrg() context: OrgContext, @Param('eventId') eventId: string) {
    // La portée vient du RÔLE, pas d'un champ du contexte : c'est la matrice
    // de permissions qui fait foi, et elle vit dans les contrats.
    const scope = ORG_ROLE_DEFINITIONS[context.role].attendeeScope;

    return this.stats.attendees(
      context.organizationId,
      eventId,
      scope === 'full' ? 'full' : 'minimal',
    );
  }

  /**
   * Export des participants (écran O6).
   *
   * Réservé à `attendee:export` : la liste porte des coordonnées complètes, que
   * `attendee:read` ne suffit pas à emporter dans un fichier.
   */
  @RequirePermission('attendee:export')
  @Get('events/:eventId/attendees.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Exporter les participants' })
  async exportAttendees(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
  ): Promise<string> {
    return this.stats.exportAttendees(context.organizationId, eventId);
  }

  @RequirePermission('payout:request')
  @Post('payouts')
  @ApiOperation({ summary: 'Demander un retrait' })
  async requestPayout(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentOrg() context: OrgContext,
    @Body() body: RequestPayoutDto,
  ): Promise<Payout> {
    return this.payouts.request(context.organizationId, user.id, body);
  }
}
