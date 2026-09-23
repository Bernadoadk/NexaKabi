import { Injectable, NotFoundException } from '@nestjs/common';
import {
  KNOWN_COUNTRIES,
  LEDGER_ENTRY_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_REASON_LABELS,
  getPaymentMethodDefinition,
  getPaymentProviderDefinition,
  type AdminLedgerEntry,
  type AdminLedgerPage,
  type AdminLedgerQuery,
  type AdminPaymentDetail,
  type AdminPaymentPage,
  type AdminPaymentSummary,
  type AdminPaymentsQuery,
  type FinanceCurrencySummary,
  type FinancePosition,
  type FinanceReport,
  type FinanceReportGrouping,
  type FinanceReportRow,
  type FinanceSummary,
  type OrganizationBalanceRow,
  type PaymentFailures,
  type PaymentStatus,
  type PaymentStatusGroup,
  type PaymentTimelineEntry,
} from '@nexakabi/contracts';
import { formatMoney, maskPhone } from '@nexakabi/utils';
import { toCsv } from '../../common/csv';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { resolvePeriod, type ResolvedPeriod } from './finance-period';

const PAGE_SIZE = 50;

/** Au-delà, un export se découpe par période : un fichier de cent mille lignes ne s'ouvre plus. */
const EXPORT_LIMIT = 20_000;

const STATUS_GROUPS: Readonly<Record<PaymentStatusGroup, PaymentStatus[]>> = {
  succeeded: ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
  failed: ['FAILED', 'EXPIRED', 'CANCELLED'],
  pending: ['INITIATED', 'PENDING', 'PROCESSING'],
};

/**
 * Une commande « vendue » au sens comptable : payée, même si elle a été
 * remboursée depuis. Le remboursement est un fait à part, compté à sa date.
 */
const SOLD_ORDER_STATUSES = Prisma.sql`('PAID', 'COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED')`;

/** Jour local de Porto-Novo, pour un horodatage stocké en UTC sans fuseau. */
const localDay = (column: Prisma.Sql) =>
  Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Porto-Novo', 'YYYY-MM-DD')`;
const localMonth = (column: Prisma.Sql) =>
  Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Porto-Novo', 'YYYY-MM')`;

/**
 * Lectures comptables de la console — l'espace Finance.
 *
 * ── Ce que ce service ne fait pas ───────────────────────────────────────────
 * Il n'écrit rien. Chaque chiffre se recalcule depuis les faits : commandes
 * payées (où la décomposition d'une vente est figée), paiements,
 * remboursements, retraits, grand livre. Un compteur tenu à part serait plus
 * rapide, et faux le jour où il divergerait des faits — sans que personne
 * puisse dire depuis quand.
 *
 * ── Pourquoi du SQL écrit à la main ─────────────────────────────────────────
 * Les agrégats croisent commandes, événements et organisations, et se
 * groupent par jour à l'heure de Porto-Novo : ce que l'ORM ne sait pas
 * exprimer. Les fragments variables — la clé de regroupement — viennent d'une
 * liste fermée, jamais d'une saisie.
 */
@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Vue d'ensemble
  // ───────────────────────────────────────────────────────────────────────────

  async summary(from?: string, to?: string): Promise<FinanceSummary> {
    const period = resolvePeriod(from, to);
    const { start, end } = period;
    const now = new Date();

    const [
      sales,
      refunds,
      reversals,
      payouts,
      payments,
      positions,
      payoutsPending,
      outstanding,
      days,
    ] = await Promise.all([
      this.prisma.$queryRaw<SalesRow[]>`
          SELECT o.currency,
                 COUNT(*)::bigint                          AS orders,
                 COALESCE(SUM(o."totalAmount"), 0)::bigint        AS gross,
                 COALESCE(SUM(o."providerFeeAmount"), 0)::bigint  AS provider_fees,
                 COALESCE(SUM(o."platformFeeAmount"), 0)::bigint  AS commission,
                 COALESCE(SUM(o."buyerFeeAmount"), 0)::bigint     AS buyer_fees,
                 COALESCE(SUM(o."organizerNetAmount"), 0)::bigint AS organizer_net
          FROM "order" o
          WHERE o."paidAt" BETWEEN ${start} AND ${end}
            AND o."totalAmount" > 0
            AND o.status IN ${SOLD_ORDER_STATUSES}
          GROUP BY o.currency`,
      this.prisma.$queryRaw<{ currency: string; status: string; amount: bigint }[]>`
          SELECT o.currency, r.status::text AS status, COALESCE(SUM(r.amount), 0)::bigint AS amount
          FROM refund r JOIN "order" o ON o.id = r."orderId"
          WHERE r."createdAt" BETWEEN ${start} AND ${end}
          GROUP BY o.currency, r.status`,
      this.prisma.$queryRaw<{ currency: string; amount: bigint }[]>`
          SELECT currency, COALESCE(SUM(amount), 0)::bigint AS amount
          FROM ledger_entry
          WHERE type = 'REFUND_FEE_REVERSAL' AND "createdAt" BETWEEN ${start} AND ${end}
          GROUP BY currency`,
      this.prisma.$queryRaw<{ currency: string; net: bigint; fees: bigint }[]>`
          SELECT currency,
                 COALESCE(SUM("netAmount"), 0)::bigint AS net,
                 COALESCE(SUM("feeAmount"), 0)::bigint AS fees
          FROM payout
          WHERE status = 'PAID' AND "completedAt" BETWEEN ${start} AND ${end}
          GROUP BY currency`,
      this.prisma.$queryRaw<{ currency: string; succeeded: bigint; failed: bigint }[]>`
          SELECT currency,
                 COUNT(*) FILTER (WHERE status IN ('SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED'))::bigint AS succeeded,
                 COUNT(*) FILTER (WHERE status IN ('FAILED', 'EXPIRED', 'CANCELLED'))::bigint AS failed
          FROM payment
          WHERE "createdAt" BETWEEN ${start} AND ${end}
          GROUP BY currency`,
      // À date : `now` est passé en paramètre plutôt que `now()` SQL. Les
      // colonnes sont des horodatages SANS fuseau, en UTC : les comparer à
      // l'heure du serveur de base décalerait tout d'une ou deux heures.
      this.prisma.$queryRaw<{ currency: string; available: bigint; pending: bigint }[]>`
          SELECT currency,
                 COALESCE(SUM(CASE WHEN "balanceState" = 'AVAILABLE'
                                     OR ("availableAt" IS NOT NULL AND "availableAt" <= ${now})
                                   THEN amount ELSE 0 END), 0)::bigint AS available,
                 COALESCE(SUM(CASE WHEN "balanceState" = 'AVAILABLE'
                                     OR ("availableAt" IS NOT NULL AND "availableAt" <= ${now})
                                   THEN 0 ELSE amount END), 0)::bigint AS pending
          FROM ledger_entry
          GROUP BY currency`,
      this.prisma.$queryRaw<{ currency: string; amount: bigint }[]>`
          SELECT currency, COALESCE(SUM("netAmount"), 0)::bigint AS amount
          FROM payout
          WHERE status IN ('PENDING', 'PROCESSING')
          GROUP BY currency`,
      this.prisma.$queryRaw<{ currency: string; amount: bigint }[]>`
          SELECT o.currency, COALESCE(SUM(r.amount), 0)::bigint AS amount
          FROM refund r JOIN "order" o ON o.id = r."orderId"
          WHERE r.status IN ('PENDING', 'PROCESSING', 'FAILED')
          GROUP BY o.currency`,
      this.prisma.$queryRaw<{ day: string; currency: string; orders: bigint; gross: bigint }[]>`
          SELECT ${localDay(Prisma.sql`o."paidAt"`)} AS day,
                 o.currency,
                 COUNT(*)::bigint AS orders,
                 COALESCE(SUM(o."totalAmount"), 0)::bigint AS gross
          FROM "order" o
          WHERE o."paidAt" BETWEEN ${start} AND ${end}
            AND o."totalAmount" > 0
            AND o.status IN ${SOLD_ORDER_STATUSES}
          GROUP BY 1, 2
          ORDER BY 1`,
    ]);

    const currencies = new Set<string>([
      ...sales.map((row) => row.currency),
      ...refunds.map((row) => row.currency),
      ...payouts.map((row) => row.currency),
      ...payments.map((row) => row.currency),
    ]);

    const summaries: FinanceCurrencySummary[] = [...currencies].sort().map((currency) => {
      const sale = sales.find((row) => row.currency === currency);
      const refundRows = refunds.filter((row) => row.currency === currency);
      const payout = payouts.find((row) => row.currency === currency);
      const paymentCounts = payments.find((row) => row.currency === currency);

      const commission = num(sale?.commission);
      const commissionReturned = num(reversals.find((row) => row.currency === currency)?.amount);
      const payoutFees = num(payout?.fees);

      return {
        currency,
        ordersPaid: num(sale?.orders),
        grossCollected: num(sale?.gross),
        providerFees: num(sale?.provider_fees),
        platformCommission: commission,
        buyerFees: num(sale?.buyer_fees),
        organizerNet: num(sale?.organizer_net),
        refunded: refundRows.reduce((total, row) => total + num(row.amount), 0),
        refundsOutstanding: refundRows
          .filter((row) => row.status !== 'COMPLETED')
          .reduce((total, row) => total + num(row.amount), 0),
        commissionReturned,
        paidOut: num(payout?.net),
        payoutFees,
        platformRevenue: commission - commissionReturned + payoutFees,
        paymentsSucceeded: num(paymentCounts?.succeeded),
        paymentsFailed: num(paymentCounts?.failed),
      };
    });

    const positionCurrencies = new Set<string>([
      ...positions.map((row) => row.currency),
      ...payoutsPending.map((row) => row.currency),
      ...outstanding.map((row) => row.currency),
    ]);

    const financePositions: FinancePosition[] = [...positionCurrencies].sort().map((currency) => {
      const position = positions.find((row) => row.currency === currency);

      return {
        currency,
        available: num(position?.available),
        pending: num(position?.pending),
        payoutsPending: num(payoutsPending.find((row) => row.currency === currency)?.amount),
        refundsOutstanding: num(outstanding.find((row) => row.currency === currency)?.amount),
      };
    });

    return {
      from: period.from,
      to: period.to,
      currencies: summaries,
      positions: financePositions,
      days: days.map((row) => ({
        date: row.day,
        currency: row.currency,
        gross: num(row.gross),
        orders: num(row.orders),
      })),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Transactions
  // ───────────────────────────────────────────────────────────────────────────

  async listPayments(query: AdminPaymentsQuery): Promise<AdminPaymentPage> {
    const where = this.paymentWhere(query);
    const page = query.page;

    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: PAYMENT_LIST_INCLUDE,
      }),
    ]);

    return { items: rows.map(toPaymentSummary), page, pageSize: PAGE_SIZE, total };
  }

  async exportPayments(query: AdminPaymentsQuery): Promise<string> {
    const rows = await this.prisma.payment.findMany({
      where: this.paymentWhere(query),
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
      include: PAYMENT_LIST_INCLUDE,
    });

    return toCsv(
      [
        'Créé le',
        'Confirmé le',
        'Commande',
        'Événement',
        'Organisation',
        'Acheteur',
        'Moyen',
        'Prestataire',
        'Pays',
        'Montant',
        'Devise',
        'Statut',
        'Motif d’échec',
        'Référence prestataire',
        'Identifiant du paiement',
      ],
      rows.map((row) => {
        const summary = toPaymentSummary(row);
        return [
          summary.createdAt,
          summary.confirmedAt,
          summary.orderReference,
          summary.eventTitle,
          summary.organizationName,
          summary.buyerName,
          summary.methodLabel,
          summary.providerLabel,
          summary.countryCode,
          summary.amount,
          summary.currency,
          PAYMENT_STATUS_LABELS[summary.status],
          summary.failureReason,
          summary.providerReference,
          summary.id,
        ];
      }),
    );
  }

  private paymentWhere(query: AdminPaymentsQuery): Prisma.PaymentWhereInput {
    const period = query.from || query.to ? resolvePeriod(query.from, query.to) : null;
    const q = query.q?.trim();

    return {
      ...(query.status ? { status: { in: STATUS_GROUPS[query.status] } } : {}),
      ...(query.method ? { methodCode: query.method } : {}),
      ...(query.provider ? { providerCode: query.provider } : {}),
      ...(query.country ? { countryCode: query.country } : {}),
      ...(period ? { createdAt: { gte: period.start, lte: period.end } } : {}),
      ...(q ? { OR: searchConditions(q) } : {}),
    };
  }

  /**
   * Un paiement, et tout ce qui lui est arrivé.
   *
   * La chronologie assemble ce que la base garde déjà — tentatives,
   * notifications, écritures, remboursements, journal d'audit — dans l'ordre
   * où c'est arrivé. C'est l'écran qui répond à « l'acheteur dit avoir payé » :
   * on y voit si l'argent est arrivé, quand, et ce qui s'en est suivi.
   */
  async paymentDetail(paymentId: string): Promise<AdminPaymentDetail> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        ...PAYMENT_LIST_INCLUDE,
        attempts: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!payment) {
      throw new NotFoundException("Ce paiement n'existe pas.");
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      include: {
        payments: { where: { id: { not: payment.id } }, orderBy: { createdAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'asc' } },
        tickets: { select: { issuedAt: true }, orderBy: { issuedAt: 'asc' } },
      },
    });

    const refundIds = order.refunds.map((refund) => refund.id);

    const [webhooks, ledger, audits] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where: { paymentId: payment.id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { OR: [{ paymentId: payment.id }, { orderId: order.id }] },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        where: { entityId: { in: [payment.id, order.id, ...refundIds] } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const summary = toPaymentSummary(payment);
    const timeline: PaymentTimelineEntry[] = [];

    timeline.push({
      at: payment.initiatedAt.toISOString(),
      kind: 'payment',
      title: 'Paiement demandé',
      detail: `${summary.methodLabel} · ${summary.providerLabel} · ${formatMoney(payment.amount, payment.currency)}`,
      tone: 'neutral',
    });

    for (const attempt of payment.attempts) {
      timeline.push({
        at: attempt.createdAt.toISOString(),
        kind: 'attempt',
        title: ATTEMPT_LABELS[attempt.kind] ?? 'Échange avec le prestataire',
        detail: describeAttempt(attempt),
        tone: attempt.error ? 'danger' : 'neutral',
      });
    }

    for (const webhook of webhooks) {
      timeline.push({
        at: webhook.createdAt.toISOString(),
        kind: 'webhook',
        title: `Notification ${WEBHOOK_STATUS_LABELS[webhook.status] ?? webhook.status}`,
        detail: webhook.error ?? webhook.externalId,
        tone:
          webhook.status === 'PROCESSED'
            ? 'info'
            : webhook.status === 'FAILED'
              ? 'danger'
              : 'neutral',
      });
    }

    if (payment.confirmedAt) {
      timeline.push({
        at: payment.confirmedAt.toISOString(),
        kind: 'payment',
        title: 'Paiement réussi',
        detail: payment.providerReference ? `Réf. ${payment.providerReference}` : null,
        tone: 'success',
      });
    }

    if (payment.failedAt) {
      timeline.push({
        at: payment.failedAt.toISOString(),
        kind: 'payment',
        title: payment.status === 'EXPIRED' ? 'Paiement expiré' : 'Paiement échoué',
        detail: payment.failureReason,
        tone: 'danger',
      });
    }

    if (order.paidAt && payment.status !== 'FAILED' && payment.confirmedAt) {
      timeline.push({
        at: order.paidAt.toISOString(),
        kind: 'order',
        title: 'Commande confirmée',
        detail: order.reference,
        tone: 'success',
      });
    }

    const firstTicket = order.tickets[0];

    if (firstTicket && payment.confirmedAt) {
      timeline.push({
        at: firstTicket.issuedAt.toISOString(),
        kind: 'tickets',
        title: `${order.tickets.length} billet${order.tickets.length > 1 ? 's' : ''} émis`,
        detail: null,
        tone: 'success',
      });
    }

    for (const entry of ledger) {
      timeline.push({
        at: entry.createdAt.toISOString(),
        kind: 'ledger',
        title: `Grand livre · ${LEDGER_ENTRY_LABELS[entry.type]}`,
        detail: `${entry.amount > 0 ? '+' : ''}${formatMoney(entry.amount, entry.currency)}${
          entry.balanceState === 'PENDING' ? ' · en attente de déblocage' : ''
        }`,
        tone: 'info',
      });
    }

    for (const refund of order.refunds) {
      timeline.push({
        at: refund.createdAt.toISOString(),
        kind: 'refund',
        title: 'Remboursement décidé',
        detail: `${formatMoney(refund.amount, order.currency)} · ${REFUND_REASON_LABELS[refund.reason]}`,
        tone: 'warning',
      });

      if (refund.completedAt) {
        timeline.push({
          at: refund.completedAt.toISOString(),
          kind: 'refund',
          title: refund.manual ? 'Remboursement fait à la main' : 'Remboursement effectué',
          detail: refund.providerReference ? `Réf. ${refund.providerReference}` : null,
          tone: 'success',
        });
      }
    }

    for (const audit of audits) {
      const label = AUDIT_LABELS[audit.action];
      if (!label) continue;

      timeline.push({
        at: audit.createdAt.toISOString(),
        kind: 'audit',
        title: label.title,
        detail: describeAuditChanges(audit.changes),
        tone: label.tone,
      });
    }

    timeline.sort((a, b) => a.at.localeCompare(b.at));

    return {
      ...summary,
      eventId: payment.order.eventId,
      orderStatus: order.status,
      failureCode: payment.failureCode,
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      failedAt: payment.failedAt?.toISOString() ?? null,
      webhookReceivedAt: payment.webhookReceivedAt?.toISOString() ?? null,
      breakdown: {
        subtotal: order.subtotalAmount,
        discount: order.discountAmount,
        buyerFee: order.buyerFeeAmount,
        total: order.totalAmount,
        providerFee: order.providerFeeAmount,
        platformCommission: order.platformFeeAmount,
        organizerNet: order.organizerNetAmount,
      },
      otherPayments: order.payments.map((other) => ({
        id: other.id,
        status: other.status,
        methodLabel: getPaymentMethodDefinition(other.methodCode)?.label ?? other.methodCode,
        amount: other.amount,
        createdAt: other.createdAt.toISOString(),
      })),
      refunds: order.refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        manual: refund.manual,
        createdAt: refund.createdAt.toISOString(),
        completedAt: refund.completedAt?.toISOString() ?? null,
      })),
      timeline,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Paiements échoués
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Pourquoi les paiements échouent, et ce que ça coûte.
   *
   * Un échec n'est pas forcément une vente perdue : l'acheteur réessaie
   * souvent avec un autre numéro ou un autre moyen. Les deux se comptent à
   * part — c'est la seconde qui dit s'il y a un problème à régler.
   */
  async failures(from?: string, to?: string): Promise<PaymentFailures> {
    const { start, end, ...period } = resolvePeriod(from, to);

    const [reasons, methods, orders] = await Promise.all([
      this.prisma.$queryRaw<{ code: string; count: bigint; reason: string | null }[]>`
        SELECT COALESCE(p."failureCode", p.status::text) AS code,
               COUNT(*)::bigint AS count,
               MAX(p."failureReason") AS reason
        FROM payment p
        WHERE p.status IN ('FAILED', 'EXPIRED', 'CANCELLED')
          AND p."createdAt" BETWEEN ${start} AND ${end}
        GROUP BY 1
        ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ method: string; failed: bigint; total: bigint }[]>`
        SELECT p."methodCode" AS method,
               COUNT(*) FILTER (WHERE p.status IN ('FAILED', 'EXPIRED', 'CANCELLED'))::bigint AS failed,
               COUNT(*) FILTER (WHERE p.status NOT IN ('INITIATED', 'PENDING', 'PROCESSING'))::bigint AS total
        FROM payment p
        WHERE p."createdAt" BETWEEN ${start} AND ${end}
        GROUP BY 1
        ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ recovered: bigint; lost: bigint }[]>`
        SELECT COUNT(DISTINCT o.id) FILTER (WHERE o."paidAt" IS NOT NULL)::bigint AS recovered,
               COUNT(DISTINCT o.id) FILTER (WHERE o."paidAt" IS NULL
                                             AND o.status IN ('EXPIRED', 'CANCELLED'))::bigint AS lost
        FROM "order" o
        WHERE EXISTS (
          SELECT 1 FROM payment p
          WHERE p."orderId" = o.id
            AND p.status IN ('FAILED', 'EXPIRED', 'CANCELLED')
            AND p."createdAt" BETWEEN ${start} AND ${end}
        )`,
    ]);

    const failed = methods.reduce((total, row) => total + num(row.failed), 0);
    const settled = methods.reduce((total, row) => total + num(row.total), 0);

    return {
      from: period.from,
      to: period.to,
      failed,
      succeeded: settled - failed,
      recoveredOrders: num(orders[0]?.recovered),
      lostOrders: num(orders[0]?.lost),
      byReason: reasons.map((row) => ({
        code: row.code,
        label: row.reason ?? FAILURE_CODE_LABELS[row.code] ?? row.code,
        count: num(row.count),
      })),
      byMethod: methods
        .filter((row) => num(row.total) > 0)
        .map((row) => ({
          methodCode: row.method,
          methodLabel: getPaymentMethodDefinition(row.method)?.label ?? row.method,
          failed: num(row.failed),
          total: num(row.total),
        })),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Grand livre
  // ───────────────────────────────────────────────────────────────────────────

  async listLedger(query: AdminLedgerQuery): Promise<AdminLedgerPage> {
    const where = this.ledgerWhere(query);
    const page = query.page;

    const [total, rows] = await Promise.all([
      this.prisma.ledgerEntry.count({ where }),
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: LEDGER_INCLUDE,
      }),
    ]);

    return { items: rows.map(toLedgerEntry), page, pageSize: PAGE_SIZE, total };
  }

  async exportLedger(query: AdminLedgerQuery): Promise<string> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: this.ledgerWhere(query),
      orderBy: { createdAt: 'asc' },
      take: EXPORT_LIMIT,
      include: LEDGER_INCLUDE,
    });

    return toCsv(
      [
        'Date',
        'Organisation',
        'Type',
        'Montant',
        'Devise',
        'Poche',
        'Disponible le',
        'Événement',
        'Commande',
        'Retrait',
        'Libellé',
        'Identifiant',
      ],
      rows.map((row) => {
        const entry = toLedgerEntry(row);
        return [
          entry.createdAt,
          entry.organizationName,
          LEDGER_ENTRY_LABELS[entry.type],
          entry.amount,
          entry.currency,
          entry.balanceState === 'PENDING' ? 'En attente' : 'Disponible',
          entry.availableAt,
          entry.eventTitle,
          entry.orderReference,
          entry.payoutReference,
          entry.description,
          entry.id,
        ];
      }),
    );
  }

  private ledgerWhere(query: AdminLedgerQuery): Prisma.LedgerEntryWhereInput {
    const period = query.from || query.to ? resolvePeriod(query.from, query.to) : null;

    return {
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(period ? { createdAt: { gte: period.start, lte: period.end } } : {}),
    };
  }

  /**
   * Ce que la plateforme détient pour chaque organisation.
   *
   * Recalculé depuis les écritures, avec la même règle que le solde affiché à
   * l'organisateur : une écriture en attente dont la date est passée est
   * disponible.
   */
  async balances(): Promise<OrganizationBalanceRow[]> {
    const now = new Date();

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        frozen: boolean;
        currency: string;
        available: bigint;
        pending: bigint;
      }[]
    >`
      SELECT l."organizationId" AS id,
             g.name,
             g."payoutFrozen" AS frozen,
             l.currency,
             COALESCE(SUM(CASE WHEN l."balanceState" = 'AVAILABLE'
                                 OR (l."availableAt" IS NOT NULL AND l."availableAt" <= ${now})
                               THEN l.amount ELSE 0 END), 0)::bigint AS available,
             COALESCE(SUM(CASE WHEN l."balanceState" = 'AVAILABLE'
                                 OR (l."availableAt" IS NOT NULL AND l."availableAt" <= ${now})
                               THEN 0 ELSE l.amount END), 0)::bigint AS pending
      FROM ledger_entry l
      JOIN organization g ON g.id = l."organizationId"
      GROUP BY l."organizationId", g.name, g."payoutFrozen", l.currency
      ORDER BY SUM(l.amount) DESC`;

    return rows.map((row) => ({
      organizationId: row.id,
      organizationName: row.name,
      currency: row.currency,
      available: num(row.available),
      pending: num(row.pending),
      total: num(row.available) + num(row.pending),
      payoutFrozen: row.frozen,
    }));
  }

  /** Organisations, pour les filtres. */
  async organizations(): Promise<{ id: string; name: string }[]> {
    return this.prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rapports
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * La cascade d'une vente, regroupée.
   *
   * Ventes et remboursements se comptent chacun à LEUR date : une vente de
   * janvier remboursée en février pèse sur février. C'est la règle d'une
   * comptabilité de caisse, et la seule qui laisse un mois clos inchangé.
   */
  async report(groupBy: FinanceReportGrouping, from?: string, to?: string): Promise<FinanceReport> {
    const period = resolvePeriod(from, to);
    const { start, end } = period;
    const grouping = GROUPINGS[groupBy];

    const [sales, refunds, payouts] = await Promise.all([
      this.prisma.$queryRaw<(SalesRow & { key: string; label: string })[]>`
        SELECT ${grouping.key(Prisma.sql`o."paidAt"`)} AS key,
               ${grouping.label(Prisma.sql`o."paidAt"`)} AS label,
               o.currency,
               COUNT(*)::bigint                                 AS orders,
               COALESCE(SUM(o."totalAmount"), 0)::bigint        AS gross,
               COALESCE(SUM(o."providerFeeAmount"), 0)::bigint  AS provider_fees,
               COALESCE(SUM(o."platformFeeAmount"), 0)::bigint  AS commission,
               COALESCE(SUM(o."buyerFeeAmount"), 0)::bigint     AS buyer_fees,
               COALESCE(SUM(o."organizerNetAmount"), 0)::bigint AS organizer_net
        FROM "order" o
        JOIN event e ON e.id = o."eventId"
        JOIN organization g ON g.id = e."organizationId"
        WHERE o."paidAt" BETWEEN ${start} AND ${end}
          AND o."totalAmount" > 0
          AND o.status IN ${SOLD_ORDER_STATUSES}
        GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<{ key: string; label: string; currency: string; amount: bigint }[]>`
        SELECT ${grouping.key(Prisma.sql`r."createdAt"`)} AS key,
               ${grouping.label(Prisma.sql`r."createdAt"`)} AS label,
               o.currency,
               COALESCE(SUM(r.amount), 0)::bigint AS amount
        FROM refund r
        JOIN "order" o ON o.id = r."orderId"
        JOIN event e ON e.id = o."eventId"
        JOIN organization g ON g.id = e."organizationId"
        WHERE r."createdAt" BETWEEN ${start} AND ${end}
        GROUP BY 1, 2, 3`,
      groupBy === 'organization'
        ? this.prisma.$queryRaw<{ key: string; currency: string; amount: bigint }[]>`
            SELECT p."organizationId" AS key, p.currency, COALESCE(SUM(p."netAmount"), 0)::bigint AS amount
            FROM payout p
            WHERE p.status = 'PAID' AND p."completedAt" BETWEEN ${start} AND ${end}
            GROUP BY 1, 2`
        : Promise.resolve([] as { key: string; currency: string; amount: bigint }[]),
    ]);

    const rows = new Map<string, FinanceReportRow>();
    const rowFor = (key: string, label: string, currency: string): FinanceReportRow => {
      const id = `${key}|${currency}`;
      let row = rows.get(id);

      if (!row) {
        row = {
          key,
          label: grouping.display(label),
          currency,
          orders: 0,
          gross: 0,
          providerFees: 0,
          commission: 0,
          organizerNet: 0,
          refunded: 0,
          paidOut: groupBy === 'organization' ? 0 : null,
        };
        rows.set(id, row);
      }

      return row;
    };

    for (const sale of sales) {
      const row = rowFor(sale.key, sale.label, sale.currency);
      row.orders += num(sale.orders);
      row.gross += num(sale.gross);
      row.providerFees += num(sale.provider_fees);
      row.commission += num(sale.commission);
      row.organizerNet += num(sale.organizer_net);
    }

    for (const refund of refunds) {
      rowFor(refund.key, refund.label, refund.currency).refunded += num(refund.amount);
    }

    for (const payout of payouts) {
      const existing = rows.get(`${payout.key}|${payout.currency}`);

      if (existing) {
        existing.paidOut = (existing.paidOut ?? 0) + num(payout.amount);
      } else {
        // Une organisation qui n'a rien vendu sur la période peut avoir été
        // payée pour une période antérieure : elle figure quand même.
        const organization = await this.prisma.organization.findUnique({
          where: { id: payout.key },
          select: { name: true },
        });
        const row = rowFor(payout.key, organization?.name ?? payout.key, payout.currency);
        row.paidOut = num(payout.amount);
      }
    }

    const sorted = [...rows.values()].sort((a, b) =>
      groupBy === 'month' ? a.key.localeCompare(b.key) : b.gross - a.gross,
    );

    return { from: period.from, to: period.to, groupBy, rows: sorted };
  }

  async exportReport(groupBy: FinanceReportGrouping, from?: string, to?: string): Promise<string> {
    const report = await this.report(groupBy, from, to);

    return toCsv(
      [
        GROUPINGS[groupBy].column,
        'Devise',
        'Commandes payées',
        'Montant brut',
        'Frais prestataire',
        'Commission Nexa-Kabi',
        'Net organisateurs',
        'Remboursé',
        ...(groupBy === 'organization' ? ['Versé'] : []),
      ],
      report.rows.map((row) => [
        row.label,
        row.currency,
        row.orders,
        row.gross,
        row.providerFees,
        row.commission,
        row.organizerNet,
        row.refunded,
        ...(groupBy === 'organization' ? [row.paidOut ?? 0] : []),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regroupements des rapports — liste FERMÉE : jamais un fragment venu d'une saisie
// ─────────────────────────────────────────────────────────────────────────────

interface Grouping {
  key: (dateColumn: Prisma.Sql) => Prisma.Sql;
  label: (dateColumn: Prisma.Sql) => Prisma.Sql;
  display: (label: string) => string;
  column: string;
}

const COUNTRY_NAMES = new Map(KNOWN_COUNTRIES.map((country) => [country.code, country.name]));

const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const GROUPINGS: Readonly<Record<FinanceReportGrouping, Grouping>> = {
  organization: {
    key: () => Prisma.sql`g.id`,
    label: () => Prisma.sql`g.name`,
    display: (label) => label,
    column: 'Organisation',
  },
  event: {
    key: () => Prisma.sql`e.id`,
    label: () => Prisma.sql`e.title`,
    display: (label) => label,
    column: 'Événement',
  },
  country: {
    key: () => Prisma.sql`o."countryCode"`,
    label: () => Prisma.sql`o."countryCode"`,
    display: (code) => COUNTRY_NAMES.get(code) ?? code,
    column: 'Pays',
  },
  month: {
    key: (column) => localMonth(column),
    label: (column) => localMonth(column),
    display: (month) => {
      const date = new Date(`${month}-01T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return month;
      const label = MONTH_FORMAT.format(date);
      return label.charAt(0).toUpperCase() + label.slice(1);
    },
    column: 'Mois',
  },
};

// ─────────────────────────────────────────────────────────────────────────────

interface SalesRow {
  currency: string;
  orders: bigint;
  gross: bigint;
  provider_fees: bigint;
  commission: bigint;
  buyer_fees: bigint;
  organizer_net: bigint;
}

const PAYMENT_LIST_INCLUDE = {
  order: {
    select: {
      reference: true,
      buyerName: true,
      eventId: true,
      event: { select: { title: true, organization: { select: { id: true, name: true } } } },
    },
  },
} as const satisfies Prisma.PaymentInclude;

type PaymentListRow = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_LIST_INCLUDE }>;

function toPaymentSummary(row: PaymentListRow): AdminPaymentSummary {
  return {
    id: row.id,
    orderId: row.orderId,
    orderReference: row.order.reference,
    eventTitle: row.order.event.title,
    organizationId: row.order.event.organization.id,
    organizationName: row.order.event.organization.name,
    buyerName: row.order.buyerName,
    payerPhone: row.payerPhone ? safeMask(row.payerPhone) : null,
    methodCode: row.methodCode,
    methodLabel: getPaymentMethodDefinition(row.methodCode)?.label ?? row.methodCode,
    providerCode: row.providerCode,
    providerLabel: getPaymentProviderDefinition(row.providerCode)?.label ?? row.providerCode,
    countryCode: row.countryCode,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    failureReason: row.failureReason,
    providerReference: row.providerReference,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}

const LEDGER_INCLUDE = {
  organization: { select: { name: true } },
  event: { select: { title: true } },
  order: { select: { reference: true } },
  payout: { select: { reference: true } },
} as const satisfies Prisma.LedgerEntryInclude;

type LedgerRow = Prisma.LedgerEntryGetPayload<{ include: typeof LEDGER_INCLUDE }>;

function toLedgerEntry(row: LedgerRow): AdminLedgerEntry {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    balanceState: row.balanceState,
    availableAt: row.availableAt?.toISOString() ?? null,
    eventTitle: row.event?.title ?? null,
    orderReference: row.order?.reference ?? null,
    payoutReference: row.payout?.reference ?? null,
    refundId: row.refundId,
    paymentId: row.paymentId,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Recherche libre : une référence de commande, une référence prestataire, un
 * identifiant, la fin d'un numéro, un nom d'acheteur.
 */
function searchConditions(q: string): Prisma.PaymentWhereInput[] {
  const digits = q.replace(/\D/g, '');

  return [
    { order: { reference: q.toUpperCase() } },
    { providerReference: q },
    { id: q },
    { order: { buyerName: { contains: q, mode: 'insensitive' } } },
    ...(digits.length >= 4 ? [{ payerPhone: { endsWith: digits } }] : []),
  ];
}

const ATTEMPT_LABELS: Readonly<Record<string, string>> = {
  INITIATE: 'Demande envoyée au prestataire',
  STATUS_POLL: 'Interrogation du prestataire',
  WEBHOOK: 'Notification du prestataire',
  REFUND: 'Demande de remboursement au prestataire',
};

const WEBHOOK_STATUS_LABELS: Readonly<Record<string, string>> = {
  RECEIVED: 'reçue, en attente',
  PROCESSED: 'traitée',
  IGNORED: 'ignorée (rejeu)',
  FAILED: 'écartée',
};

const FAILURE_CODE_LABELS: Readonly<Record<string, string>> = {
  EXPIRED: 'Demande non validée à temps',
  CANCELLED: 'Abandonné par l’acheteur',
  FAILED: 'Refusé par l’opérateur',
};

/** Les actions d'audit qui disent quelque chose de plus que les autres sources. */
const AUDIT_LABELS: Readonly<
  Record<string, { title: string; tone: PaymentTimelineEntry['tone'] }>
> = {
  'payment.reconciled': {
    title: 'Rattrapé par interrogation — la notification n’est jamais arrivée',
    tone: 'warning',
  },
  'payment.webhook_ignored': { title: 'Notification écartée', tone: 'warning' },
  'refund.requested': { title: 'Remboursement décidé par un administrateur', tone: 'neutral' },
  'refund.manual_required': { title: 'Remboursement à faire à la main', tone: 'warning' },
  'refund.failed': { title: 'Remboursement refusé par le prestataire', tone: 'danger' },
  'refund.recorded': { title: 'Remboursement consigné à la main', tone: 'info' },
  'refund.duplicate_suspected': { title: 'Double remboursement possible', tone: 'danger' },
};

function describeAttempt(attempt: {
  error: string | null;
  durationMs: number | null;
  responsePayload: Prisma.JsonValue | null;
}): string | null {
  const parts: string[] = [];

  const status = readStatus(attempt.responsePayload);
  if (status) parts.push(`statut ${status}`);
  if (attempt.durationMs !== null) parts.push(`${attempt.durationMs} ms`);
  if (attempt.error) parts.push(attempt.error);

  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Le statut annoncé dans une réponse conservée, s'il y figure. */
function readStatus(payload: Prisma.JsonValue | null): string | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const status = (payload as Record<string, unknown>).status;
    if (typeof status === 'string') return status;
  }
  return null;
}

/** Les changements consignés, en une ligne — sans jamais y recopier un numéro. */
function describeAuditChanges(changes: Prisma.JsonValue | null): string | null {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;

  const record = changes as Record<string, unknown>;
  const reason = record.reason ?? record.reference ?? record.attemptedStatus;

  return typeof reason === 'string' ? reason : null;
}

function safeMask(phone: string): string {
  try {
    return maskPhone(phone);
  } catch {
    return `•••• ${phone.slice(-4)}`;
  }
}

/** Les sommes SQL reviennent en `bigint` : sans risque tant qu'elles restent sous 2⁵³. */
function num(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export type { ResolvedPeriod };
