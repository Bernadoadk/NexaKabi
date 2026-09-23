import { Injectable, Logger } from '@nestjs/common';
import {
  getPaymentProviderDefinition,
  type PaymentProviderCode,
  type ProviderWallet,
  type ReconciliationIssue,
  type ReconciliationReport,
  type ReconciliationRun,
} from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ADVISORY_LOCKS, AdvisoryLockService } from '../../infra/scheduling/advisory-lock.service';
import { PayoutsService } from '../finance/payouts.service';
import { RefundsService } from '../finance/refunds.service';
import { PaymentProviderRegistry } from '../payments/provider.registry';
import { ReconciliationService } from '../payments/reconciliation.service';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Au-delà, un paiement en attente n'est plus « lent » : quelque chose ne répond pas. */
const STALE_PAYMENT_AFTER = 30 * MINUTE;
/** Une notification sans paiement est normale quelques secondes, pas au-delà. */
const ORPHAN_WEBHOOK_AFTER = 10 * MINUTE;
const STALE_OUTGOING_AFTER = 24 * HOUR;
const OVERDUE_REFUND_AFTER = 72 * HOUR;

/** Écarts listés par catégorie : au-delà, le problème n'est plus un cas mais une panne. */
const ISSUES_PER_KIND = 50;

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/**
 * Rapprochement, vu de la console.
 *
 * ── Une liste d'écarts à traiter, pas un rapport à lire ─────────────────────
 * Chaque ligne pose une question précise — ce paiement a-t-il abouti ? cette
 * notification, de quelle transaction parle-t-elle ? — et dit où aller pour y
 * répondre. Une page vide est le bon résultat.
 *
 * ── Ce que le rapprochement ne peut pas voir ────────────────────────────────
 * KPay ne publie pas la liste de ses transactions : une transaction que nous
 * ne connaissons pas ne se découvre que par sa notification (« sans objet »)
 * ou par l'écart du solde de son wallet. Les deux sont ici.
 */
@Injectable()
export class AdminReconciliationService {
  private readonly logger = new Logger(AdminReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly reconciliation: ReconciliationService,
    private readonly payouts: PayoutsService,
    private readonly refunds: RefundsService,
    private readonly locks: AdvisoryLockService,
  ) {}

  async report(): Promise<ReconciliationReport> {
    const now = Date.now();
    const before = (delay: number) => new Date(now - delay);

    const [
      stalePayments,
      orphanWebhooks,
      mismatches,
      paidWithoutOrder,
      ordersWithoutLedger,
      stalePayouts,
      staleRefunds,
      overdueRefunds,
      wallets,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
          initiatedAt: { lt: before(STALE_PAYMENT_AFTER) },
        },
        orderBy: { initiatedAt: 'asc' },
        take: ISSUES_PER_KIND,
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          providerCode: true,
          initiatedAt: true,
          order: { select: { reference: true } },
        },
      }),
      this.prisma.webhookEvent.findMany({
        where: {
          paymentId: null,
          OR: [
            { status: 'FAILED' },
            { status: 'RECEIVED', createdAt: { lt: before(ORPHAN_WEBHOOK_AFTER) } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: ISSUES_PER_KIND,
      }),
      this.prisma.webhookEvent.findMany({
        where: { status: 'FAILED', paymentId: { not: null }, error: { contains: 'annoncé' } },
        orderBy: { createdAt: 'desc' },
        take: ISSUES_PER_KIND,
      }),
      this.prisma.payment.findMany({
        where: {
          status: 'SUCCEEDED',
          order: { status: { notIn: ['PAID', 'COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED'] } },
        },
        take: ISSUES_PER_KIND,
        select: {
          id: true,
          amount: true,
          currency: true,
          confirmedAt: true,
          order: { select: { reference: true, status: true } },
        },
      }),
      this.prisma.$queryRaw<{ id: string; reference: string; paidAt: Date; total: number }[]>`
        SELECT o.id, o.reference, o."paidAt", o."totalAmount" AS total
        FROM "order" o
        WHERE o."paidAt" IS NOT NULL
          AND o."totalAmount" > 0
          AND NOT EXISTS (
            SELECT 1 FROM ledger_entry l WHERE l."orderId" = o.id AND l.type = 'SALE'
          )
        ORDER BY o."paidAt" DESC
        LIMIT ${ISSUES_PER_KIND}`,
      this.prisma.payout.findMany({
        where: { status: 'PROCESSING', processedAt: { lt: before(STALE_OUTGOING_AFTER) } },
        take: ISSUES_PER_KIND,
        select: {
          reference: true,
          netAmount: true,
          currency: true,
          processedAt: true,
          organization: { select: { name: true } },
        },
      }),
      this.prisma.refund.findMany({
        where: { status: 'PROCESSING', lastAttemptAt: { lt: before(STALE_OUTGOING_AFTER) } },
        take: ISSUES_PER_KIND,
        select: {
          amount: true,
          lastAttemptAt: true,
          providerReference: true,
          order: { select: { reference: true, currency: true } },
        },
      }),
      this.prisma.refund.findMany({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          createdAt: { lt: before(OVERDUE_REFUND_AFTER) },
        },
        orderBy: { createdAt: 'asc' },
        take: ISSUES_PER_KIND,
        select: {
          amount: true,
          createdAt: true,
          failureReason: true,
          order: { select: { reference: true, currency: true, buyerName: true } },
        },
      }),
      this.wallets(),
    ]);

    const issues: ReconciliationIssue[] = [
      ...stalePayments.map<ReconciliationIssue>((payment) => ({
        kind: 'stale_payment',
        severity: 'high',
        title: `${payment.order.reference} · ${formatMoney(payment.amount, payment.currency)}`,
        detail:
          `Toujours « ${payment.status} » chez ${providerLabel(payment.providerCode)} : ni ` +
          'notification ni interrogation n’ont tranché. L’acheteur a peut-être été débité sans billet.',
        at: payment.initiatedAt.toISOString(),
        href: `/finance/transactions/${payment.id}`,
      })),
      ...mismatches.map<ReconciliationIssue>((webhook) => ({
        kind: 'amount_mismatch',
        severity: 'high',
        title: `Notification ${providerLabel(webhook.providerCode)} écartée`,
        detail: `${webhook.error ?? ''} — rien n’a été crédité sur sa foi.`,
        at: webhook.createdAt.toISOString(),
        href: webhook.paymentId ? `/finance/transactions/${webhook.paymentId}` : null,
      })),
      ...paidWithoutOrder.map<ReconciliationIssue>((payment) => ({
        kind: 'paid_without_order',
        severity: 'high',
        title: `${payment.order.reference} · ${formatMoney(payment.amount, payment.currency)}`,
        detail: `Paiement réussi, mais la commande est « ${payment.order.status} » : l’acheteur a payé, a-t-il ses billets ?`,
        at: (payment.confirmedAt ?? new Date(now)).toISOString(),
        href: `/finance/transactions/${payment.id}`,
      })),
      ...ordersWithoutLedger.map<ReconciliationIssue>((order) => ({
        kind: 'order_without_ledger',
        severity: 'high',
        title: `${order.reference} · ${formatMoney(Number(order.total))}`,
        detail:
          'Commande payée sans vente inscrite au grand livre : l’organisateur ne la voit pas dans son solde.',
        at: new Date(order.paidAt).toISOString(),
        href: null,
      })),
      ...overdueRefunds.map<ReconciliationIssue>((refund) => ({
        kind: 'overdue_refund',
        severity: 'high',
        title: `${refund.order.reference} · ${formatMoney(refund.amount, refund.order.currency)} · ${refund.order.buyerName}`,
        detail: refund.failureReason ?? 'Dû depuis plus de trois jours, jamais rendu.',
        at: refund.createdAt.toISOString(),
        href: '/finance/remboursements',
      })),
      ...orphanWebhooks.map<ReconciliationIssue>((webhook) => ({
        kind: 'unknown_webhook',
        severity: 'medium',
        title: `Notification ${providerLabel(webhook.providerCode)} · ${webhook.externalId}`,
        detail:
          webhook.error ??
          'Aucun paiement ne lui correspond : une transaction du prestataire que Nexa-Kabi ne connaît pas.',
        at: webhook.createdAt.toISOString(),
        href: null,
      })),
      ...stalePayouts.map<ReconciliationIssue>((payout) => ({
        kind: 'stale_payout',
        severity: 'medium',
        title: `${payout.reference} · ${formatMoney(payout.netAmount, payout.currency)} · ${payout.organization.name}`,
        detail:
          'Accepté par le prestataire, jamais conclu. Vérifie chez lui, puis conclus à la main.',
        at: (payout.processedAt ?? new Date(now)).toISOString(),
        href: '/retraits?statut=PROCESSING',
      })),
      ...staleRefunds.map<ReconciliationIssue>((refund) => ({
        kind: 'stale_refund',
        severity: 'medium',
        title: `${refund.order.reference} · ${formatMoney(refund.amount, refund.order.currency)}`,
        detail: `Accepté par le prestataire${refund.providerReference ? ` (réf. ${refund.providerReference})` : ''}, jamais conclu.`,
        at: (refund.lastAttemptAt ?? new Date(now)).toISOString(),
        href: '/finance/remboursements?file=processing',
      })),
    ];

    issues.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.at.localeCompare(a.at),
    );

    return { generatedAt: new Date(now).toISOString(), issues, wallets };
  }

  /**
   * Passe de rapprochement à la demande — quand un opérateur signale un
   * incident, sans attendre la minute suivante.
   *
   * Sous les MÊMES verrous que les tâches planifiées : un clic pendant une
   * passe automatique ne conclut rien deux fois, il la laisse finir.
   */
  async run(): Promise<ReconciliationRun> {
    const payments = await this.locks.runExclusively(ADVISORY_LOCKS.reconcilePayments, () =>
      this.reconciliation.reconcile({ maxAgeHours: 72 }),
    );
    const payouts = await this.locks.runExclusively(ADVISORY_LOCKS.reconcilePayouts, () =>
      this.payouts.reconcileProcessing(),
    );
    const refunds = await this.locks.runExclusively(ADVISORY_LOCKS.reconcileRefunds, () =>
      this.refunds.reconcileProcessing(),
    );

    return {
      payments: payments ?? { inspected: 0, recovered: 0, expired: 0, orphanWebhooks: 0 },
      payouts: payouts ?? { inspected: 0, paid: 0, failed: 0 },
      refunds: refunds ?? { inspected: 0, completed: 0, failed: 0 },
    };
  }

  /**
   * Solde de chaque wallet, face à nos écritures.
   *
   * Attendu = encaissé net de la commission du prestataire − versé par lui −
   * remboursé par lui. Ce calcul ignore ce que le prestataire prend sur les
   * retraits, qu'il ne nous annonce pas : un petit écart stable est normal.
   * Un écart qui grandit sans retrait désigne un mouvement que nous ne
   * connaissons pas.
   */
  private async wallets(): Promise<ProviderWallet[]> {
    const wallets: ProviderWallet[] = [];

    for (const code of this.registry.availableCodes) {
      const provider = this.registry.get(code);
      if (!provider.getBalance) continue;

      const [collected, paidOut, refunded] = await Promise.all([
        this.prisma.$queryRaw<{ currency: string; amount: bigint }[]>`
          SELECT currency, COALESCE(SUM(amount - COALESCE("providerFeeAmount", 0)), 0)::bigint AS amount
          FROM payment
          WHERE "providerCode" = ${code}
            AND status IN ('SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED')
          GROUP BY currency`,
        this.prisma.$queryRaw<{ currency: string; amount: bigint }[]>`
          SELECT currency, COALESCE(SUM("netAmount"), 0)::bigint AS amount
          FROM payout
          WHERE "providerCode" = ${code} AND status = 'PAID'
          GROUP BY currency`,
        this.prisma.$queryRaw<{ currency: string; amount: bigint }[]>`
          SELECT o.currency, COALESCE(SUM(r.amount), 0)::bigint AS amount
          FROM refund r
          JOIN payment p ON p.id = r."paymentId"
          JOIN "order" o ON o.id = r."orderId"
          WHERE p."providerCode" = ${code} AND r.status = 'COMPLETED' AND r.manual = false
          GROUP BY o.currency`,
      ]);

      const expectedFor = (currency: string) =>
        Number(collected.find((row) => row.currency === currency)?.amount ?? 0) -
        Number(paidOut.find((row) => row.currency === currency)?.amount ?? 0) -
        Number(refunded.find((row) => row.currency === currency)?.amount ?? 0);

      try {
        const balances = await provider.getBalance();
        const currencies = new Set([
          ...balances.map((b) => b.currency),
          ...collected.map((r) => r.currency),
        ]);

        for (const currency of currencies) {
          const balance = balances.find((entry) => entry.currency === currency);

          wallets.push({
            providerCode: code,
            providerLabel: providerLabel(code),
            currency,
            reported: balance
              ? {
                  balance: balance.balance,
                  reserved: balance.reserved,
                  available: balance.available,
                }
              : null,
            expected: expectedFor(currency),
            error: balance ? null : 'Le prestataire ne publie pas de solde dans cette devise.',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Solde ${code} illisible : ${message}`);

        for (const row of collected) {
          wallets.push({
            providerCode: code,
            providerLabel: providerLabel(code),
            currency: row.currency,
            reported: null,
            expected: expectedFor(row.currency),
            error: message,
          });
        }
      }
    }

    return wallets;
  }
}

function providerLabel(code: string): string {
  return getPaymentProviderDefinition(code as PaymentProviderCode)?.label ?? code;
}
