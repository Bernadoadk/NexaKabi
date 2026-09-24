/**
 * Contrats de l'espace Finance de la console.
 *
 * ── Ce que l'espace montre, et d'où il le tient ─────────────────────────────
 * Rien ici n'est un compteur tenu à part. Chaque montant se recalcule depuis
 * les faits : les commandes payées — où la décomposition d'une vente est
 * FIGÉE au moment du paiement —, les paiements, les remboursements, les
 * retraits et le grand livre. Un chiffre de cet espace doit donc toujours
 * pouvoir s'expliquer ligne par ligne, par les écrans qui suivent.
 *
 * ── Une vente, en cascade ───────────────────────────────────────────────────
 *   Montant brut          ce que les participants ont payé
 *   − Frais prestataire   ce que le prestataire (Kkiapay) a prélevé sur nous
 *   − Commission          ce que Nexa-Kabi garde
 *   = Net organisateurs   ce qui revient aux organisateurs
 *
 * ── Les montants ne se mélangent jamais entre devises ───────────────────────
 * Chaque agrégat est rendu PAR DEVISE. Additionner des francs CFA d'Afrique
 * de l'Ouest et d'Afrique centrale donnerait un nombre sans signification.
 */

import { z } from 'zod';
import { idSchema } from './common.js';
import {
  balanceStateSchema,
  ledgerEntryTypeSchema,
  orderStatusSchema,
  paymentStatusSchema,
  refundReasonSchema,
  refundStatusSchema,
} from './enums.js';
import { countryCodeSchema } from './payments.js';

// ─────────────────────────────────────────────────────────────────────────────
// Période
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une période se donne en jours calendaires, bornes comprises, à l'heure de
 * Porto-Novo : c'est l'heure dans laquelle la plateforme compte.
 */
export const financeDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

export const financePeriodSchema = z
  .object({
    from: financeDateSchema,
    to: financeDateSchema,
  })
  .refine((period) => period.from <= period.to, {
    message: 'La fin de la période précède son début.',
    path: ['to'],
  });

export type FinancePeriod = z.infer<typeof financePeriodSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Vue d'ensemble
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qui s'est passé dans une devise, sur la période. */
export const financeCurrencySummarySchema = z.object({
  currency: z.string(),

  /** Commandes payées sur la période. */
  ordersPaid: z.number().int(),
  /** Ce que les participants ont payé. */
  grossCollected: z.number().int(),
  /** Prélevé par le prestataire de paiement, tel qu'il l'a annoncé. */
  providerFees: z.number().int(),
  /** Commission Nexa-Kabi, toutes parts confondues. */
  platformCommission: z.number().int(),
  /** Dont la part ajoutée au prix payé par les participants. */
  buyerFees: z.number().int(),
  /** Ce qui revient aux organisateurs. */
  organizerNet: z.number().int(),

  /** Remboursements décidés sur la période, et ce qui en reste à rendre. */
  refunded: z.number().int(),
  refundsOutstanding: z.number().int(),
  /** Commission rendue avec les remboursements frais compris. */
  commissionReturned: z.number().int(),

  /** Versé aux organisateurs sur la période, et frais de retrait perçus. */
  paidOut: z.number().int(),
  payoutFees: z.number().int(),

  /** Commission − commission restituée + frais de retrait. */
  platformRevenue: z.number().int(),

  paymentsSucceeded: z.number().int(),
  paymentsFailed: z.number().int(),
});

export type FinanceCurrencySummary = z.infer<typeof financeCurrencySummarySchema>;

/**
 * Ce que la plateforme détient pour les organisateurs, À DATE — hors période.
 *
 * C'est une dette : l'argent est sur le compte du prestataire, mais il
 * appartient aux organisateurs, déduction faite de ce qu'ils doivent rendre.
 */
export const financePositionSchema = z.object({
  currency: z.string(),
  /** Retirable maintenant. */
  available: z.number().int(),
  /** En attente de déblocage. */
  pending: z.number().int(),
  /** Retraits demandés, pas encore versés. */
  payoutsPending: z.number().int(),
  /** Remboursements décidés, pas encore rendus. */
  refundsOutstanding: z.number().int(),
});

export type FinancePosition = z.infer<typeof financePositionSchema>;

export const financeDayPointSchema = z.object({
  /** AAAA-MM-JJ, heure de Porto-Novo. */
  date: z.string(),
  currency: z.string(),
  gross: z.number().int(),
  orders: z.number().int(),
});

export const financeSummarySchema = z.object({
  from: financeDateSchema,
  to: financeDateSchema,
  currencies: z.array(financeCurrencySummarySchema),
  positions: z.array(financePositionSchema),
  days: z.array(financeDayPointSchema),
});

export type FinanceSummary = z.infer<typeof financeSummarySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les trois familles d'états, telles qu'on les filtre.
 *
 * Plus utiles que les neuf statuts bruts : un comptable cherche « ce qui est
 * entré », « ce qui a échoué », « ce qui n'est pas encore tranché ».
 */
export const PAYMENT_STATUS_GROUPS = ['succeeded', 'failed', 'pending'] as const;
export const paymentStatusGroupSchema = z.enum(PAYMENT_STATUS_GROUPS);
export type PaymentStatusGroup = z.infer<typeof paymentStatusGroupSchema>;

export const PAYMENT_STATUS_LABELS: Readonly<Record<z.infer<typeof paymentStatusSchema>, string>> =
  {
    INITIATED: 'Initié',
    PENDING: 'En attente',
    PROCESSING: 'En cours',
    SUCCEEDED: 'Réussi',
    FAILED: 'Échoué',
    EXPIRED: 'Expiré',
    CANCELLED: 'Annulé',
    REFUNDED: 'Remboursé',
    PARTIALLY_REFUNDED: 'Remboursé en partie',
  };

export const adminPaymentsQuerySchema = z.object({
  status: paymentStatusGroupSchema.optional(),
  method: z.string().optional(),
  provider: z.string().optional(),
  country: countryCodeSchema.optional(),
  from: financeDateSchema.optional(),
  to: financeDateSchema.optional(),
  /** Référence de commande, référence prestataire, identifiant, fin de numéro. */
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type AdminPaymentsQuery = z.infer<typeof adminPaymentsQuerySchema>;

export const adminPaymentSummarySchema = z.object({
  id: idSchema,
  orderId: idSchema,
  orderReference: z.string(),
  eventTitle: z.string(),
  organizationId: idSchema,
  organizationName: z.string(),
  buyerName: z.string(),
  /** Toujours masqué : cet écran se lit à plusieurs, le numéro n'y sert à rien. */
  payerPhone: z.string().nullable(),
  methodCode: z.string(),
  methodLabel: z.string(),
  providerCode: z.string(),
  providerLabel: z.string(),
  countryCode: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: paymentStatusSchema,
  failureReason: z.string().nullable(),
  providerReference: z.string().nullable(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
});

export type AdminPaymentSummary = z.infer<typeof adminPaymentSummarySchema>;

export const adminPaymentPageSchema = z.object({
  items: z.array(adminPaymentSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type AdminPaymentPage = z.infer<typeof adminPaymentPageSchema>;

/**
 * Un moment de la vie d'un paiement.
 *
 * La chronologie assemble ce que la base garde déjà : chaque échange avec le
 * prestataire, chaque notification reçue, la confirmation de la commande,
 * les billets, les écritures au grand livre, les remboursements. Rien n'y est
 * reconstitué de mémoire.
 */
export const paymentTimelineEntrySchema = z.object({
  at: z.string(),
  kind: z.enum(['payment', 'attempt', 'webhook', 'order', 'tickets', 'ledger', 'refund', 'audit']),
  title: z.string(),
  detail: z.string().nullable(),
  tone: z.enum(['neutral', 'success', 'warning', 'danger', 'info']),
});

export type PaymentTimelineEntry = z.infer<typeof paymentTimelineEntrySchema>;

export const adminPaymentDetailSchema = adminPaymentSummarySchema.extend({
  eventId: idSchema,
  orderStatus: orderStatusSchema,
  failureCode: z.string().nullable(),
  expiresAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  webhookReceivedAt: z.string().nullable(),

  /** La cascade de la commande, telle qu'elle a été figée au paiement. */
  breakdown: z.object({
    subtotal: z.number().int(),
    discount: z.number().int(),
    buyerFee: z.number().int(),
    total: z.number().int(),
    providerFee: z.number().int(),
    platformCommission: z.number().int(),
    organizerNet: z.number().int(),
  }),

  /** Les autres tentatives de paiement de la même commande. */
  otherPayments: z.array(
    z.object({
      id: idSchema,
      status: paymentStatusSchema,
      methodLabel: z.string(),
      amount: z.number().int(),
      createdAt: z.string(),
    }),
  ),

  refunds: z.array(
    z.object({
      id: idSchema,
      amount: z.number().int(),
      status: refundStatusSchema,
      reason: refundReasonSchema,
      manual: z.boolean(),
      createdAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),

  timeline: z.array(paymentTimelineEntrySchema),

  /**
   * Une transaction du prestataire peut être rattachée à la main à ce
   * paiement — fenêtre de paiement dont ni la page ni la notification ne nous
   * ont rapporté l'issue.
   */
  canAttachTransaction: z.boolean(),
});

export type AdminPaymentDetail = z.infer<typeof adminPaymentDetailSchema>;

/**
 * Rattacher une transaction du prestataire à un paiement.
 *
 * Le cas : un acheteur a payé, mais ni la page ni la notification ne nous
 * l'ont dit — il se présente au support avec la référence de sa transaction.
 * La référence n'est qu'une piste : le serveur la lit chez le prestataire et
 * n'agit que si elle porte l'identifiant de CE paiement et le bon montant.
 */
export const attachPaymentTransactionSchema = z.object({
  providerReference: z
    .string()
    .trim()
    .min(1, 'Indique la référence de la transaction')
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, 'Référence de transaction invalide'),
});

export type AttachPaymentTransactionInput = z.infer<typeof attachPaymentTransactionSchema>;

export const ATTACH_TRANSACTION_OUTCOMES = [
  /** Encaissée : la commande est payée, les billets émis. */
  'settled',
  /** Encaissée, mais les places ne sont plus disponibles : à rembourser. */
  'unfulfillable',
  /** Encaissée sur une commande déjà réglée : à rembourser. */
  'duplicate',
  /** La transaction a échoué chez le prestataire : rien n'a été encaissé. */
  'failed',
  /** Encore en cours chez le prestataire : rattachée, relue automatiquement. */
  'pending',
  /** Ce paiement est déjà réglé par cette transaction. */
  'already',
] as const;

export const attachPaymentTransactionResultSchema = z.object({
  outcome: z.enum(ATTACH_TRANSACTION_OUTCOMES),
  message: z.string(),
});

export type AttachPaymentTransactionResult = z.infer<typeof attachPaymentTransactionResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Paiements échoués
// ─────────────────────────────────────────────────────────────────────────────

export const paymentFailuresSchema = z.object({
  from: financeDateSchema,
  to: financeDateSchema,
  failed: z.number().int(),
  succeeded: z.number().int(),
  /** Commandes finalement payées malgré un échec : l'acheteur a réessayé. */
  recoveredOrders: z.number().int(),
  /** Commandes jamais payées après un échec : des ventes perdues. */
  lostOrders: z.number().int(),
  byReason: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      count: z.number().int(),
    }),
  ),
  byMethod: z.array(
    z.object({
      methodCode: z.string(),
      methodLabel: z.string(),
      failed: z.number().int(),
      total: z.number().int(),
    }),
  ),
});

export type PaymentFailures = z.infer<typeof paymentFailuresSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Grand livre
// ─────────────────────────────────────────────────────────────────────────────

export const adminLedgerQuerySchema = z.object({
  organizationId: idSchema.optional(),
  type: ledgerEntryTypeSchema.optional(),
  from: financeDateSchema.optional(),
  to: financeDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type AdminLedgerQuery = z.infer<typeof adminLedgerQuerySchema>;

export const adminLedgerEntrySchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  organizationName: z.string(),
  type: ledgerEntryTypeSchema,
  amount: z.number().int(),
  currency: z.string(),
  balanceState: balanceStateSchema,
  availableAt: z.string().nullable(),
  eventTitle: z.string().nullable(),
  orderReference: z.string().nullable(),
  payoutReference: z.string().nullable(),
  refundId: z.string().nullable(),
  paymentId: z.string().nullable(),
  description: z.string(),
  createdAt: z.string(),
});

export type AdminLedgerEntry = z.infer<typeof adminLedgerEntrySchema>;

export const adminLedgerPageSchema = z.object({
  items: z.array(adminLedgerEntrySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type AdminLedgerPage = z.infer<typeof adminLedgerPageSchema>;

/** Solde d'une organisation, recalculé depuis ses écritures. */
export const organizationBalanceRowSchema = z.object({
  organizationId: idSchema,
  organizationName: z.string(),
  currency: z.string(),
  available: z.number().int(),
  pending: z.number().int(),
  total: z.number().int(),
  payoutFrozen: z.boolean(),
});

export type OrganizationBalanceRow = z.infer<typeof organizationBalanceRowSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Rapprochement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les écarts que le rapprochement sait détecter.
 *
 * Chacun est une question précise à laquelle quelqu'un doit répondre, pas un
 * chiffre à contempler :
 *   · `stale_payment`       — un paiement que ni webhook ni interrogation ne tranchent ;
 *   · `unknown_webhook`     — une notification sans objet chez nous : une
 *                             transaction du prestataire que nous ne connaissons pas ;
 *   · `amount_mismatch`     — une notification qui annonçait un autre montant ;
 *   · `paid_without_order`  — un paiement réussi dont la commande n'est pas payée ;
 *   · `order_without_ledger`— une commande payée absente du grand livre ;
 *   · `stale_payout`        — un retrait en cours depuis plus d'un jour ;
 *   · `stale_refund`        — un remboursement en cours depuis plus d'un jour ;
 *   · `overdue_refund`      — un remboursement dû depuis plus de trois jours.
 */
export const RECONCILIATION_ISSUE_KINDS = [
  'stale_payment',
  'unknown_webhook',
  'amount_mismatch',
  'paid_without_order',
  'duplicate_payment',
  'order_without_ledger',
  'stale_payout',
  'stale_refund',
  'overdue_refund',
] as const;

export const reconciliationIssueKindSchema = z.enum(RECONCILIATION_ISSUE_KINDS);
export type ReconciliationIssueKind = z.infer<typeof reconciliationIssueKindSchema>;

export const RECONCILIATION_ISSUE_LABELS: Readonly<Record<ReconciliationIssueKind, string>> = {
  stale_payment: 'Paiement jamais tranché',
  unknown_webhook: 'Notification sans objet',
  amount_mismatch: 'Montant annoncé incohérent',
  paid_without_order: 'Paiement réussi, commande non payée',
  duplicate_payment: 'Commande payée deux fois',
  order_without_ledger: 'Commande payée absente du grand livre',
  stale_payout: 'Retrait en cours depuis plus d’un jour',
  stale_refund: 'Remboursement en cours depuis plus d’un jour',
  overdue_refund: 'Remboursement dû depuis plus de trois jours',
};

export const reconciliationIssueSchema = z.object({
  kind: reconciliationIssueKindSchema,
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string(),
  detail: z.string(),
  at: z.string(),
  /** Où aller pour trancher, dans la console. */
  href: z.string().nullable(),
});

export type ReconciliationIssue = z.infer<typeof reconciliationIssueSchema>;

/**
 * Solde d'un wallet chez le prestataire, face à ce que nos écritures en disent.
 *
 * L'écart attendu n'est pas nul : les frais que le prestataire prend sur les
 * retraits ne nous sont pas annoncés. Un écart qui GRANDIT sans retrait, en
 * revanche, désigne un mouvement que nous ne connaissons pas.
 */
export const providerWalletSchema = z.object({
  providerCode: z.string(),
  providerLabel: z.string(),
  currency: z.string(),
  /** Solde annoncé par le prestataire, `null` si la lecture a échoué. */
  reported: z
    .object({
      balance: z.number(),
      reserved: z.number(),
      available: z.number(),
    })
    .nullable(),
  /** Encaissé net − versé − remboursé, selon nos écritures. */
  expected: z.number().int(),
  error: z.string().nullable(),
});

export type ProviderWallet = z.infer<typeof providerWalletSchema>;

export const reconciliationReportSchema = z.object({
  generatedAt: z.string(),
  issues: z.array(reconciliationIssueSchema),
  wallets: z.array(providerWalletSchema),
});

export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;

export const reconciliationRunSchema = z.object({
  payments: z.object({
    inspected: z.number().int(),
    recovered: z.number().int(),
    expired: z.number().int(),
    orphanWebhooks: z.number().int(),
  }),
  payouts: z.object({
    inspected: z.number().int(),
    paid: z.number().int(),
    failed: z.number().int(),
  }),
  refunds: z.object({
    inspected: z.number().int(),
    completed: z.number().int(),
    failed: z.number().int(),
  }),
});

export type ReconciliationRun = z.infer<typeof reconciliationRunSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Rapports
// ─────────────────────────────────────────────────────────────────────────────

export const FINANCE_REPORT_GROUPINGS = ['organization', 'event', 'country', 'month'] as const;
export const financeReportGroupingSchema = z.enum(FINANCE_REPORT_GROUPINGS);
export type FinanceReportGrouping = z.infer<typeof financeReportGroupingSchema>;

export const FINANCE_REPORT_GROUPING_LABELS: Readonly<Record<FinanceReportGrouping, string>> = {
  organization: 'Par organisation',
  event: 'Par événement',
  country: 'Par pays',
  month: 'Par mois',
};

export const financeReportRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  currency: z.string(),
  orders: z.number().int(),
  gross: z.number().int(),
  providerFees: z.number().int(),
  commission: z.number().int(),
  organizerNet: z.number().int(),
  refunded: z.number().int(),
  /** Versé sur la période : n'a de sens que par organisation. */
  paidOut: z.number().int().nullable(),
});

export type FinanceReportRow = z.infer<typeof financeReportRowSchema>;

export const financeReportSchema = z.object({
  from: financeDateSchema,
  to: financeDateSchema,
  groupBy: financeReportGroupingSchema,
  rows: z.array(financeReportRowSchema),
});

export type FinanceReport = z.infer<typeof financeReportSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Commissions
// ─────────────────────────────────────────────────────────────────────────────

export const COMMISSION_SCOPES = ['PLATFORM', 'COUNTRY', 'ORGANIZATION'] as const;
export const commissionScopeSchema = z.enum(COMMISSION_SCOPES);
export type CommissionScope = z.infer<typeof commissionScopeSchema>;

export const COMMISSION_SCOPE_LABELS: Readonly<Record<CommissionScope, string>> = {
  PLATFORM: 'Toute la plateforme',
  COUNTRY: 'Un pays',
  ORGANIZATION: 'Une organisation',
};

export const adminCommissionPolicySchema = z.object({
  id: idSchema,
  name: z.string(),
  scope: commissionScopeSchema,
  countryCode: z.string().nullable(),
  organizationId: idSchema.nullable(),
  organizationName: z.string().nullable(),
  percentageBps: z.number().int(),
  fixedAmountPerTicket: z.number().int(),
  minFeePerOrder: z.number().int().nullable(),
  maxFeePerOrder: z.number().int().nullable(),
  buyerSharePercent: z.number().int(),
  appliesToFreeTickets: z.boolean(),
  payoutFeeBps: z.number().int(),
  payoutFeeMax: z.number().int(),
  minPayoutAmount: z.number().int(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  /** En vigueur à cet instant. */
  current: z.boolean(),
  /** Commandes qui l'ont appliquée — figée sur chacune, elle ne se modifie plus. */
  ordersCount: z.number().int(),
});

export type AdminCommissionPolicy = z.infer<typeof adminCommissionPolicySchema>;

/**
 * Nouvelle version d'une politique.
 *
 * ── Pourquoi on ne modifie jamais une politique ─────────────────────────────
 * Chaque commande garde l'identifiant de la politique qui l'a tarifée.
 * Modifier ses taux réécrirait l'explication de ventes passées. Changer une
 * commission, c'est donc en publier une nouvelle version, qui ferme la
 * précédente de même portée à l'instant où elle prend effet.
 */
export const createCommissionPolicySchema = z
  .object({
    name: z.string().trim().min(3, 'Donne-lui un nom qui dise sa raison d’être.').max(80),
    scope: commissionScopeSchema,
    countryCode: countryCodeSchema.optional(),
    organizationId: idSchema.optional(),
    /** 500 = 5 %. Plafonné à 30 % : au-delà, c'est une erreur de saisie. */
    percentageBps: z.number().int().min(0).max(3_000),
    fixedAmountPerTicket: z.number().int().min(0).max(100_000),
    minFeePerOrder: z.number().int().min(0).max(100_000).nullable(),
    maxFeePerOrder: z.number().int().min(0).max(10_000_000).nullable(),
    buyerSharePercent: z.number().int().min(0).max(100),
    appliesToFreeTickets: z.boolean(),
    payoutFeeBps: z.number().int().min(0).max(1_000),
    payoutFeeMax: z.number().int().min(0).max(1_000_000),
    minPayoutAmount: z.number().int().min(0).max(10_000_000),
  })
  .refine((input) => input.scope !== 'COUNTRY' || Boolean(input.countryCode), {
    message: 'Choisis le pays.',
    path: ['countryCode'],
  })
  .refine((input) => input.scope !== 'ORGANIZATION' || Boolean(input.organizationId), {
    message: 'Choisis l’organisation.',
    path: ['organizationId'],
  })
  .refine(
    (input) =>
      input.maxFeePerOrder === null ||
      input.minFeePerOrder === null ||
      input.maxFeePerOrder >= input.minFeePerOrder,
    { message: 'Le plafond doit dépasser le plancher.', path: ['maxFeePerOrder'] },
  );

export type CreateCommissionPolicyInput = z.infer<typeof createCommissionPolicySchema>;
