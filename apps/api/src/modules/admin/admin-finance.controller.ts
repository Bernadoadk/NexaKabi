import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  adminLedgerQuerySchema,
  adminPaymentsQuerySchema,
  createCommissionPolicySchema,
  financeReportGroupingSchema,
  type AdminLedgerQuery,
  type AdminPaymentsQuery,
  type FinanceReportGrouping,
} from '@nexakabi/contracts';
import type { ZodType } from 'zod';
import { Public } from '../auth/decorators/public.decorator';
import { AdminCommissionsService } from './admin-commissions.service';
import { AdminFinanceService } from './admin-finance.service';
import { AdminReconciliationService } from './admin-reconciliation.service';
import {
  AdminSessionGuard,
  RequireAdminAccess,
  RequireMoney,
  type AdminRequest,
} from './admin-session.guard';

class CreateCommissionPolicyDto extends createZodDto(createCommissionPolicySchema) {}

type RawQuery = Record<string, string | undefined>;

/**
 * Espace Finance de la console.
 *
 * Lire demande l'espace « Finance » en consultation. Lancer une passe de
 * rapprochement demande la décision ; publier ou fermer une commission, en
 * plus, le droit de déplacer l'argent — c'est décider de ce que chaque vente
 * rapporte.
 *
 * Les paramètres d'adresse sont en français, comme dans le reste de la
 * console : ce sont eux qu'on lit dans la barre d'adresse et qu'on partage.
 */
@ApiTags('Administration · Finance')
@Public()
@UseGuards(AdminSessionGuard)
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(
    private readonly finance: AdminFinanceService,
    private readonly reconciliation: AdminReconciliationService,
    private readonly commissions: AdminCommissionsService,
  ) {}

  @RequireAdminAccess('finance', 'read')
  @Get('summary')
  @ApiOperation({ summary: 'Vue d’ensemble : la cascade des ventes et la position à date' })
  summary(@Query('du') from?: string, @Query('au') to?: string) {
    return this.finance.summary(from || undefined, to || undefined);
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  @RequireAdminAccess('finance', 'read')
  @Get('payments')
  @ApiOperation({ summary: 'Paiements, filtrés' })
  listPayments(@Query() query: RawQuery) {
    return this.finance.listPayments(paymentsQuery(query));
  }

  @RequireAdminAccess('finance', 'read')
  @Get('payments.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Exporter les paiements filtrés' })
  exportPayments(@Query() query: RawQuery) {
    return this.finance.exportPayments(paymentsQuery(query));
  }

  @RequireAdminAccess('finance', 'read')
  @Get('payments/:id')
  @ApiOperation({ summary: 'Un paiement et sa chronologie' })
  paymentDetail(@Param('id') id: string) {
    return this.finance.paymentDetail(id);
  }

  @RequireAdminAccess('finance', 'read')
  @Get('failures')
  @ApiOperation({ summary: 'Paiements échoués : causes, moyens, ventes perdues' })
  failures(@Query('du') from?: string, @Query('au') to?: string) {
    return this.finance.failures(from || undefined, to || undefined);
  }

  // ── Grand livre ───────────────────────────────────────────────────────────

  @RequireAdminAccess('finance', 'read')
  @Get('ledger')
  @ApiOperation({ summary: 'Écritures du grand livre, toutes organisations' })
  listLedger(@Query() query: RawQuery) {
    return this.finance.listLedger(ledgerQuery(query));
  }

  @RequireAdminAccess('finance', 'read')
  @Get('ledger.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Exporter les écritures filtrées' })
  exportLedger(@Query() query: RawQuery) {
    return this.finance.exportLedger(ledgerQuery(query));
  }

  @RequireAdminAccess('finance', 'read')
  @Get('balances')
  @ApiOperation({ summary: 'Solde de chaque organisation, recalculé' })
  balances() {
    return this.finance.balances();
  }

  @RequireAdminAccess('finance', 'read')
  @Get('organizations')
  @ApiOperation({ summary: 'Organisations, pour les filtres' })
  organizations() {
    return this.finance.organizations();
  }

  // ── Rapprochement ─────────────────────────────────────────────────────────

  @RequireAdminAccess('finance', 'read')
  @Get('reconciliation')
  @ApiOperation({ summary: 'Écarts à traiter et solde des wallets' })
  reconciliationReport() {
    return this.reconciliation.report();
  }

  @RequireAdminAccess('finance', 'act')
  @Post('reconciliation/run')
  @ApiOperation({ summary: 'Lancer une passe de rapprochement maintenant' })
  runReconciliation() {
    return this.reconciliation.run();
  }

  // ── Rapports ──────────────────────────────────────────────────────────────

  @RequireAdminAccess('finance', 'read')
  @Get('report')
  @ApiOperation({ summary: 'Cascade des ventes, regroupée' })
  report(@Query() query: RawQuery) {
    return this.finance.report(grouping(query), query.du || undefined, query.au || undefined);
  }

  @RequireAdminAccess('finance', 'read')
  @Get('report.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Exporter le rapport' })
  exportReport(@Query() query: RawQuery) {
    return this.finance.exportReport(grouping(query), query.du || undefined, query.au || undefined);
  }

  // ── Commissions ───────────────────────────────────────────────────────────

  @RequireAdminAccess('finance', 'read')
  @Get('commissions')
  @ApiOperation({ summary: 'Politiques de commission, version par version' })
  listCommissions() {
    return this.commissions.list();
  }

  @RequireAdminAccess('finance', 'act')
  @RequireMoney()
  @Post('commissions')
  @ApiOperation({ summary: 'Publier une nouvelle version de commission' })
  async createCommission(@Body() body: CreateCommissionPolicyDto, @Req() request: AdminRequest) {
    await this.commissions.create(body, request.admin.id);
    return { ok: true };
  }

  @RequireAdminAccess('finance', 'act')
  @RequireMoney()
  @Post('commissions/:id/close')
  @ApiOperation({ summary: 'Fermer une politique de commission' })
  async closeCommission(@Param('id') id: string, @Req() request: AdminRequest) {
    await this.commissions.close(id, request.admin.id);
    return { ok: true };
  }
}

function paymentsQuery(query: RawQuery): AdminPaymentsQuery {
  return parse(adminPaymentsQuerySchema, {
    status: query.statut || undefined,
    method: query.moyen || undefined,
    provider: query.prestataire || undefined,
    country: query.pays || undefined,
    from: query.du || undefined,
    to: query.au || undefined,
    q: query.q || undefined,
    page: query.page || 1,
  });
}

function ledgerQuery(query: RawQuery): AdminLedgerQuery {
  return parse(adminLedgerQuerySchema, {
    organizationId: query.organisation || undefined,
    type: query.type || undefined,
    from: query.du || undefined,
    to: query.au || undefined,
    page: query.page || 1,
  });
}

function grouping(query: RawQuery): FinanceReportGrouping {
  return parse(financeReportGroupingSchema, query.regroupement || 'organization');
}

/** Un filtre invalide est une erreur de l'adresse : on le dit, on ne l'ignore pas. */
function parse<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Filtres invalides.');
  }

  return parsed.data;
}
