/**
 * Calcul des frais, des commissions et de la répartition d'une commande.
 *
 * ── Origine des règles ──────────────────────────────────────────────────────
 * Scénario de référence du prototype (écran « Récapitulatif ») :
 *   Sous-total billets            10 000   (2 × Pass Standard à 5 000)
 *   Frais de service Nexa-Kabi      + 500
 *   Code promo YELE25 (−10 %)     − 1 000
 *   ──────────────────────────────────────
 *   Total à payer                   9 500
 *
 * Encart « Répartition du montant » du même écran :
 *   Organisateur                    8 550
 *   Commission plateforme             500
 *   Frais opérateur MoMo              450
 *   ──────────────────────────────────────
 *                                   9 500
 *
 * Ces deux blocs sont cohérents entre eux : les frais de service sont ajoutés
 * au participant, et les frais opérateur sont prélevés sur la part organisateur.
 *
 * ── Décision A1, tranchée ───────────────────────────────────────────────────
 * Le libellé du prototype annonce « 5 % + 100 FCFA par billet », ses montants
 * n'appliquent que les 5 %. Retenu : 5 % avec un plancher de 100 FCFA PAR
 * COMMANDE. Le raisonnement complet figure sur DEFAULT_COMMISSION_POLICY.
 *
 * Voir docs/PROJECT_ANALYSIS.md §8 (A1) et docs/TECHNICAL_ARCHITECTURE.md §6.7.
 */

import { applyBasisPoints, clampAmount } from '@nexakabi/utils';

export interface CommissionPolicy {
  /** Commission plateforme, en points de base (500 = 5 %). */
  readonly percentageBps: number;
  /** Part fixe de commission, par billet. */
  readonly fixedAmountPerTicket: number;
  /** Bornes de la commission, par commande. */
  readonly minFeePerOrder?: number;
  readonly maxFeePerOrder?: number;
  /**
   * Répartition des frais de service : 100 = intégralement à la charge du
   * participant (modèle B), 0 = intégralement à la charge de l'organisateur
   * (modèle A), entre les deux = partage (modèle C).
   */
  readonly buyerSharePercent: number;
  /** Les billets gratuits génèrent-ils une commission ? */
  readonly appliesToFreeTickets: boolean;
  /** Frais de retrait, en points de base, et leur plafond. */
  readonly payoutFeeBps: number;
  readonly payoutFeeMax: number;
  /** Montant minimal d'une demande de retrait. */
  readonly minPayoutAmount: number;
}

/**
 * Politique par défaut — décision A1 tranchée.
 *
 * Le prototype annonce « 5 % + 100 FCFA par billet » mais n'applique que les
 * 5 % dans ses montants. Trancher demandait d'arbitrer entre trois intérêts :
 *
 *  · Le participant veut un prix bas et sans surprise.
 *  · L'organisateur veut recevoir le maximum.
 *  · La plateforme doit couvrir un coût fixe réel par transaction — frais
 *    opérateur Mobile Money, SMS, génération et livraison du billet.
 *
 * Une part fixe PAR BILLET pèse démesurément sur les petits prix : 100 FCFA sur
 * un billet à 1 000 représentent 10 % à eux seuls, soit 15 % au total. Or le
 * petit prix est le segment le plus courant au Bénin et celui qui porte
 * l'accessibilité du produit.
 *
 * Retenu : 5 %, avec un PLANCHER PAR COMMANDE de 100 FCFA. Le coût fixe est
 * couvert une fois par transaction — ce qui correspond à sa nature réelle —
 * sans pénaliser l'achat de plusieurs petits billets. Le scénario du prototype
 * reste inchangé : 5 % de 10 000 = 500, au-dessus du plancher.
 *
 * Aucun plafond : il transférerait à la plateforme le coût des gros paniers,
 * qui sont précisément ceux qui financent le service.
 */
export const DEFAULT_COMMISSION_POLICY: CommissionPolicy = {
  percentageBps: 500, // 5 %
  fixedAmountPerTicket: 0, // le coût fixe est porté par le plancher de commande
  minFeePerOrder: 100, // couvre le coût de traitement d'une transaction
  buyerSharePercent: 100, // les frais sont ajoutés au participant
  appliesToFreeTickets: false, // un événement gratuit ne prélève rien
  payoutFeeBps: 100, // 1 %
  payoutFeeMax: 2_000,
  minPayoutAmount: 5_000,
};

export interface OrderLine {
  /** Prix unitaire du billet, hors frais. */
  readonly unitPrice: number;
  readonly quantity: number;
}

export interface FeeBreakdownInput {
  readonly lines: readonly OrderLine[];
  /** Remise déjà calculée (code promo). */
  readonly discountAmount?: number;
  /** Frais réellement facturés par l'opérateur de paiement, si connus. */
  readonly providerFeeAmount?: number;
  readonly policy?: CommissionPolicy;
}

export interface FeeBreakdown {
  /** Somme des billets, avant remise et avant frais. */
  readonly subtotalAmount: number;
  readonly discountAmount: number;
  /** Commission plateforme totale. */
  readonly platformFeeAmount: number;
  /** Part de la commission ajoutée au montant payé par le participant. */
  readonly buyerFeeAmount: number;
  /** Part de la commission prélevée sur la recette de l'organisateur. */
  readonly organizerFeeAmount: number;
  /** Frais de l'opérateur de paiement, toujours à la charge de l'organisateur. */
  readonly providerFeeAmount: number;
  /** Ce que le participant paie réellement. */
  readonly totalAmount: number;
  /** Ce qui revient à l'organisateur. */
  readonly organizerNetAmount: number;
  readonly ticketCount: number;
}

/**
 * Calcule la décomposition complète d'une commande.
 *
 * Invariants garantis (vérifiés par les tests) :
 *   totalAmount        = subtotal − discount + buyerFee
 *   organizerNetAmount = subtotal − discount − organizerFee − providerFee
 *   platformFeeAmount  = buyerFee + organizerFee
 *   totalAmount        = organizerNet + platformFee + providerFee
 */
export function computeFeeBreakdown({
  lines,
  discountAmount = 0,
  providerFeeAmount = 0,
  policy = DEFAULT_COMMISSION_POLICY,
}: FeeBreakdownInput): FeeBreakdown {
  const subtotalAmount = lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  const ticketCount = lines.reduce((total, line) => total + line.quantity, 0);

  const billableTicketCount = policy.appliesToFreeTickets
    ? ticketCount
    : lines.reduce((total, line) => total + (line.unitPrice > 0 ? line.quantity : 0), 0);

  const cappedDiscount = Math.min(discountAmount, subtotalAmount);
  const discountedSubtotal = subtotalAmount - cappedDiscount;

  // La commission porte sur le sous-total avant remise : une remise consentie par
  // l'organisateur ne réduit pas la commission de la plateforme.
  const rawPlatformFee =
    applyBasisPoints(subtotalAmount, policy.percentageBps) +
    policy.fixedAmountPerTicket * billableTicketCount;

  const platformFeeAmount =
    billableTicketCount === 0 && !policy.appliesToFreeTickets
      ? 0
      : clampAmount(rawPlatformFee, policy.minFeePerOrder, policy.maxFeePerOrder);

  const buyerFeeAmount = Math.round((platformFeeAmount * policy.buyerSharePercent) / 100);
  const organizerFeeAmount = platformFeeAmount - buyerFeeAmount;

  const totalAmount = discountedSubtotal + buyerFeeAmount;
  const organizerNetAmount = discountedSubtotal - organizerFeeAmount - providerFeeAmount;

  return {
    subtotalAmount,
    discountAmount: cappedDiscount,
    platformFeeAmount,
    buyerFeeAmount,
    organizerFeeAmount,
    providerFeeAmount,
    totalAmount,
    organizerNetAmount,
    ticketCount,
  };
}

/** Frais de retrait : pourcentage plafonné. */
export function computePayoutFee(
  grossAmount: number,
  policy: CommissionPolicy = DEFAULT_COMMISSION_POLICY,
): number {
  return clampAmount(applyBasisPoints(grossAmount, policy.payoutFeeBps), 0, policy.payoutFeeMax);
}

/** Montant net effectivement versé à l'organisateur pour un retrait. */
export function computePayoutNet(
  grossAmount: number,
  policy: CommissionPolicy = DEFAULT_COMMISSION_POLICY,
): number {
  return grossAmount - computePayoutFee(grossAmount, policy);
}

/**
 * Vérifie qu'une demande de retrait est recevable.
 * Renvoie `null` si elle l'est, sinon le motif de refus destiné à l'utilisateur.
 */
export function validatePayoutRequest(
  grossAmount: number,
  availableBalance: number,
  policy: CommissionPolicy = DEFAULT_COMMISSION_POLICY,
): string | null {
  if (grossAmount < policy.minPayoutAmount) {
    return `Le montant minimum d’un retrait est de ${policy.minPayoutAmount} FCFA.`;
  }
  if (grossAmount > availableBalance) {
    return 'Le montant demandé dépasse votre solde disponible.';
  }
  return null;
}
