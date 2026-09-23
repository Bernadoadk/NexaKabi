/**
 * Contrat financier.
 *
 * ── Le principe qui gouverne tout ce fichier ────────────────────────────────
 * Le solde d'un organisateur n'est JAMAIS un champ que l'on met à jour. C'est
 * la somme d'écritures immuables. Une correction n'efface rien : elle ajoute
 * une écriture inverse.
 *
 * C'est plus verbeux qu'un compteur, et c'est le prix de la seule propriété qui
 * compte ici : **tout montant affiché est explicable ligne par ligne**. Un
 * organisateur qui conteste son solde doit pouvoir en obtenir le détail, et
 * nous devons pouvoir le lui donner sans reconstituer quoi que ce soit.
 *
 * Voir docs/DATABASE_PROPOSAL.md §8.
 */

import { z } from 'zod';
import { idSchema, signedAmountSchema } from './common.js';
import {
  balanceStateSchema,
  eventStatusSchema,
  ledgerEntryTypeSchema,
  payoutAccountTypeSchema,
  payoutStatusSchema,
  type LedgerEntryType,
  type PayoutStatus,
  type RefundReason,
  type RefundStatus,
} from './enums.js';

// ─────────────────────────────────────────────────────────────────────────────
// Écritures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signe attendu de chaque type.
 *
 * `null` pour `ADJUSTMENT`, seul type qui puisse aller dans les deux sens —
 * c'est précisément sa raison d'être.
 */
export const LEDGER_ENTRY_SIGNS: Readonly<Record<LedgerEntryType, 1 | -1 | null>> = {
  SALE: 1,
  /** Déplacement explicite vers la poche bloquée. */
  HOLD: -1,
  /** Déplacement explicite vers la poche disponible. */
  RELEASE: 1,
  PLATFORM_FEE: -1,
  PROVIDER_FEE: -1,
  REFUND: -1,
  REFUND_FEE_REVERSAL: 1,
  PAYOUT: -1,
  PAYOUT_FEE: -1,
  PAYOUT_REVERSAL: 1,
  FREEZE: -1,
  UNFREEZE: 1,
  ADJUSTMENT: null,
};

/** Libellés affichés à l'organisateur, dans son relevé. */
export const LEDGER_ENTRY_LABELS: Readonly<Record<LedgerEntryType, string>> = {
  SALE: 'Vente de billets',
  HOLD: 'Mise en attente',
  RELEASE: 'Déblocage anticipé',
  PLATFORM_FEE: 'Commission Nexa-Kabi',
  PROVIDER_FEE: 'Frais opérateur',
  REFUND: 'Remboursement',
  REFUND_FEE_REVERSAL: 'Commission restituée',
  PAYOUT: 'Retrait',
  PAYOUT_FEE: 'Frais de retrait',
  PAYOUT_REVERSAL: 'Retrait annulé',
  FREEZE: 'Solde gelé',
  UNFREEZE: 'Gel levé',
  ADJUSTMENT: 'Ajustement',
};

/**
 * Un montant est-il cohérent avec son type ?
 *
 * Vérifié à l'écriture ET par une contrainte en base : une écriture au mauvais
 * signe fausserait un solde de façon indétectable à la lecture.
 */
export function isValidLedgerAmount(type: LedgerEntryType, amount: number): boolean {
  if (!Number.isInteger(amount) || amount === 0) return false;

  const expected = LEDGER_ENTRY_SIGNS[type];
  if (expected === null) return true;

  return Math.sign(amount) === expected;
}

/**
 * ── Comment le déblocage préserve l'immuabilité ─────────────────────────────
 * `balanceState` n'est JAMAIS modifié après écriture. Une recette bloquée naît
 * en `PENDING` avec sa date de déblocage, et devient disponible quand cette
 * date est passée — le temps fait le travail, aucune mutation n'est nécessaire :
 *
 *   disponible = Σ(AVAILABLE) + Σ(PENDING dont availableAt ≤ maintenant)
 *
 * Un déblocage ANTICIPÉ, décidé par un administrateur, s'écrit en revanche
 * explicitement : une paire `HOLD` (− en `PENDING`) et `RELEASE` (+ en
 * `AVAILABLE`). Le total ne bouge pas, l'argent change de poche, et le relevé
 * porte la trace de la décision.
 */

export const ledgerEntrySchema = z.object({
  id: idSchema,
  type: ledgerEntryTypeSchema,
  /** Signé : positif = crédit, négatif = débit. */
  amount: signedAmountSchema,
  currency: z.string(),
  balanceState: balanceStateSchema,
  /** Date de déblocage, affichée à l'organisateur. */
  availableAt: z.string().nullable(),

  eventId: idSchema.nullable(),
  eventTitle: z.string().nullable(),
  orderId: idSchema.nullable(),
  orderReference: z.string().nullable(),
  payoutId: idSchema.nullable(),

  description: z.string(),
  createdAt: z.string(),
});

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Solde
// ─────────────────────────────────────────────────────────────────────────────

export const balanceSchema = z.object({
  /** Retirable maintenant. */
  availableAmount: signedAmountSchema,
  /** En attente de déblocage. */
  pendingAmount: signedAmountSchema,
  /** Somme de tout le grand livre : disponible + en attente. */
  totalAmount: signedAmountSchema,
  currency: z.string(),

  /** Cumuls, pour l'écran finances. */
  grossSales: signedAmountSchema,
  platformFees: signedAmountSchema,
  providerFees: signedAmountSchema,
  refunds: signedAmountSchema,
  paidOut: signedAmountSchema,

  /** Prochaine date de déblocage, quand il reste des fonds en attente. */
  nextReleaseAt: z.string().nullable(),
  /** Montant minimal d'un retrait, rappelé à l'organisateur. */
  minPayoutAmount: z.number().int(),
  /** Le retrait est-il possible ? Sinon, `payoutBlockedReason` l'explique. */
  canRequestPayout: z.boolean(),
  payoutBlockedReason: z.string().nullable(),
});

export type Balance = z.infer<typeof balanceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Politique de déblocage — décision A4
// ─────────────────────────────────────────────────────────────────────────────

export interface HoldTier {
  readonly tier: 0 | 1 | 2;
  readonly requiresVerification: boolean;
  readonly minCompletedEvents: number;
  /** Part des ventes débloquée immédiatement, en pourcentage. */
  readonly immediateReleasePercent: number;
  /** Délai après la fin de l'événement avant déblocage du reste. */
  readonly holdHoursAfterEvent: number;
  readonly label: string;
  readonly description: string;
}

/**
 * Paliers de déblocage.
 *
 * ── Pourquoi bloquer l'argent d'un organisateur ─────────────────────────────
 * Parce qu'un billet vendu n'est pas un service rendu. Entre l'achat et
 * l'événement, l'organisateur peut annuler, disparaître, ou ne jamais ouvrir
 * les portes — et c'est la plateforme qui devra rembourser. Le blocage n'est
 * pas de la défiance : c'est ce qui permet de garantir le remboursement au
 * participant, donc ce qui rend la plateforme crédible pour lui.
 *
 * ── Pourquoi trois paliers plutôt qu'une règle unique ───────────────────────
 * Un organisateur qui a livré trois événements sans incident n'a pas le même
 * profil de risque qu'un inconnu. Lui appliquer les mêmes contraintes le
 * pousserait vers le paiement en espèces, hors plateforme.
 *
 * Voir docs/PROJECT_ANALYSIS.md §8, ambiguïté A4.
 */
export const HOLD_TIERS: readonly HoldTier[] = [
  {
    tier: 0,
    requiresVerification: false,
    minCompletedEvents: 0,
    immediateReleasePercent: 0,
    holdHoursAfterEvent: 0,
    label: 'Identité non vérifiée',
    description:
      'Tu peux vendre, mais le retrait reste bloqué tant que ton identité n’est pas vérifiée. ' +
      'La vérification prend moins de 24 h.',
  },
  {
    tier: 1,
    requiresVerification: true,
    minCompletedEvents: 0,
    immediateReleasePercent: 0,
    holdHoursAfterEvent: 48,
    label: 'Vérifié',
    description:
      'Tes recettes sont débloquées 48 h après la fin de chaque événement, le temps de traiter ' +
      'les éventuelles réclamations.',
  },
  {
    tier: 2,
    requiresVerification: true,
    minCompletedEvents: 3,
    immediateReleasePercent: 60,
    holdHoursAfterEvent: 48,
    label: 'Organisateur confirmé',
    description:
      '60 % de tes ventes sont disponibles immédiatement. Le solde est débloqué 48 h après ' +
      'la fin de l’événement.',
  },
];

/**
 * Palier applicable à une organisation.
 *
 * Le palier le plus élevé dont toutes les conditions sont remplies.
 */
export function resolveHoldTier(input: {
  isVerified: boolean;
  completedEventsCount: number;
}): HoldTier {
  const eligible = HOLD_TIERS.filter(
    (tier) =>
      (!tier.requiresVerification || input.isVerified) &&
      input.completedEventsCount >= tier.minCompletedEvents,
  );

  // `HOLD_TIERS[0]` est toujours éligible : la liste ne peut pas être vide.
  return eligible[eligible.length - 1] ?? HOLD_TIERS[0]!;
}

export interface ReleasePlan {
  /** Part créditée immédiatement en `AVAILABLE`. */
  readonly immediateAmount: number;
  /** Part bloquée jusqu'à `availableAt`. */
  readonly heldAmount: number;
  /** Instant de déblocage du solde bloqué. `null` si rien n'est bloqué. */
  readonly availableAt: Date | null;
}

/**
 * Répartit une recette entre part immédiate et part bloquée.
 *
 * L'arrondi va à la part BLOQUÉE : en cas de franc indivisible, la plateforme
 * garde le doute pour elle plutôt que de le libérer trop tôt.
 */
export function planRelease(input: {
  netAmount: number;
  tier: HoldTier;
  eventEndsAt: Date;
}): ReleasePlan {
  if (input.tier.tier === 0) {
    // Palier 0 : tout est bloqué, sans date de déblocage — c'est la
    // vérification d'identité qui débloquera, pas le temps qui passe.
    return { immediateAmount: 0, heldAmount: input.netAmount, availableAt: null };
  }

  const immediateAmount = Math.floor((input.netAmount * input.tier.immediateReleasePercent) / 100);

  const heldAmount = input.netAmount - immediateAmount;

  return {
    immediateAmount,
    heldAmount,
    availableAt:
      heldAmount > 0
        ? new Date(input.eventEndsAt.getTime() + input.tier.holdHoursAfterEvent * 3_600_000)
        : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Retraits
// ─────────────────────────────────────────────────────────────────────────────

export const PAYOUT_STATUS_LABELS: Readonly<Record<PayoutStatus, string>> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  PAID: 'Effectué',
  FAILED: 'Échoué',
  CANCELLED: 'Annulé',
};

/** Transitions autorisées d'une demande de retrait. */
export const PAYOUT_STATUS_TRANSITIONS: Readonly<Record<PayoutStatus, readonly PayoutStatus[]>> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PAID', 'FAILED'],
  /**
   * Un retrait effectué est définitif. Le corriger passerait par un
   * `ADJUSTMENT` au grand livre, pas par un retour en arrière — c'est la règle
   * d'immuabilité qui l'impose.
   */
  PAID: [],
  /**
   * Un échec est terminal côté demande : l'argent revient au solde par une
   * écriture `PAYOUT_REVERSAL`, et l'organisateur refait une demande.
   */
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionPayout(from: PayoutStatus, to: PayoutStatus): boolean {
  return PAYOUT_STATUS_TRANSITIONS[from].includes(to);
}

export const requestPayoutSchema = z.object({
  payoutAccountId: idSchema,
  amount: z.number().int().min(1, 'Indique un montant'),
});

export type RequestPayoutInput = z.infer<typeof requestPayoutSchema>;

export const payoutSchema = z.object({
  id: idSchema,
  reference: z.string(),
  status: payoutStatusSchema,

  grossAmount: z.number().int(),
  feeAmount: z.number().int(),
  /** Ce que l'organisateur reçoit réellement. Affiché AVANT validation. */
  netAmount: z.number().int(),
  currency: z.string(),

  /**
   * Mobile Money part chez l'opérateur ; un virement bancaire se fait à la
   * main et s'enregistre ensuite. L'écran d'administration en dépend pour
   * proposer le bon geste.
   */
  accountType: payoutAccountTypeSchema,
  accountLabel: z.string(),
  accountMaskedNumber: z.string(),
  /** Moyen et pays de réception, tels que le compte les porte. */
  methodCode: z.string(),
  countryCode: z.string(),
  /**
   * Vrai si un prestataire branché sait exécuter ce versement. Faux : le
   * virement se fait à la main et s'enregistre — l'écran d'administration
   * propose le bon geste.
   */
  automatic: z.boolean(),

  failureReason: z.string().nullable(),
  requestedAt: z.string(),
  processedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type Payout = z.infer<typeof payoutSchema>;

/**
 * Enregistrement d'un versement fait hors plateforme.
 *
 * Un virement bancaire ne passe par aucun agrégateur : l'administrateur le
 * fait depuis la banque, puis le consigne ici avec sa référence. Le même geste
 * sert de secours quand un opérateur n'a pas su verser automatiquement.
 */
export const recordPayoutSchema = z
  .object({
    outcome: z.enum(['PAID', 'FAILED']),
    /** Référence du virement chez la banque ou l'opérateur. */
    reference: z.string().trim().max(80).optional(),
    failureReason: z
      .string()
      .trim()
      .min(5, 'Dis pourquoi le versement a échoué.')
      .max(500)
      .optional(),
  })
  .refine((input) => input.outcome !== 'FAILED' || Boolean(input.failureReason), {
    message: 'Un échec de versement exige une cause.',
    path: ['failureReason'],
  });

export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Remboursements
// ─────────────────────────────────────────────────────────────────────────────

export const REFUND_STATUS_LABELS: Readonly<Record<RefundStatus, string>> = {
  PENDING: 'À rembourser',
  PROCESSING: 'En cours',
  COMPLETED: 'Remboursé',
  FAILED: 'Refusé par l’opérateur',
};

export const REFUND_REASON_LABELS: Readonly<Record<RefundReason, string>> = {
  EVENT_CANCELLED: 'Événement annulé',
  CUSTOMER_REQUEST: 'Demande du participant',
  DUPLICATE_PAYMENT: 'Paiement en double',
  DISPUTE: 'Litige',
  ADMIN: 'Décision de la plateforme',
};

// ─────────────────────────────────────────────────────────────────────────────
// Statistiques
// ─────────────────────────────────────────────────────────────────────────────

export const salesPointSchema = z.object({
  /** Jour, au format ISO court. */
  date: z.string(),
  ticketCount: z.number().int(),
  grossAmount: z.number().int(),
});

export const eventStatsSchema = z.object({
  eventId: idSchema,
  eventTitle: z.string(),
  ticketsSold: z.number().int(),
  ticketsAvailable: z.number().int(),
  grossAmount: z.number().int(),
  netAmount: z.number().int(),
  checkedInCount: z.number().int(),
  /** Taux de présence, en pourcentage. `null` avant l'événement. */
  attendanceRate: z.number().nullable(),
  byTicketType: z.array(
    z.object({
      ticketTypeId: idSchema,
      name: z.string(),
      sold: z.number().int(),
      total: z.number().int(),
      grossAmount: z.number().int(),
    }),
  ),
  salesByDay: z.array(salesPointSchema),
});

export type EventStats = z.infer<typeof eventStatsSchema>;

/**
 * Statistiques consolidées de l'organisation, tous événements confondus.
 *
 * ── Pourquoi ce n'est pas une simple somme d'`EventStats` ────────────────
 * Appeler `forEvent` un par un, un événement à la fois, ferait autant
 * d'aller-retours HTTP que l'organisateur a d'événements. Ce type porte le
 * résultat d'agrégats calculés en une seule fois côté base de données.
 */
export const organizationEventStatsSchema = z.object({
  eventId: idSchema,
  title: z.string(),
  status: eventStatusSchema,
  startsAt: z.string(),
  ticketsSold: z.number().int(),
  checkedInCount: z.number().int(),
});

export const organizationStatsSchema = z.object({
  eventsCount: z.number().int(),
  publishedEventsCount: z.number().int(),
  ticketsSoldTotal: z.number().int(),
  checkedInTotal: z.number().int(),
  byEvent: z.array(organizationEventStatsSchema),
  /** Ventes des trente derniers jours d'activité, agrégées par jour. */
  salesByDay: z.array(salesPointSchema),
});

export type OrganizationStats = z.infer<typeof organizationStatsSchema>;
