/**
 * Contrat du tunnel d'achat.
 *
 * Cible du prototype : du lien WhatsApp au billet en poche en moins de
 * 90 secondes, et trois taps hors saisie du code Mobile Money.
 */

import { z } from 'zod';
import { emailSchema, idSchema, orderReferenceSchema, phoneSchema } from './common.js';
import { orderStatusSchema, paymentProviderSchema, paymentStatusSchema } from './enums.js';

/** Durée pendant laquelle les places restent bloquées. */
export const RESERVATION_TTL_MINUTES = 30;
/** Délai au-delà duquel l'opérateur abandonne la demande de paiement. */
export const PAYMENT_TIMEOUT_MINUTES = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Création de commande
// ─────────────────────────────────────────────────────────────────────────────

export const orderLineSchema = z.object({
  ticketTypeId: idSchema,
  quantity: z.number().int().min(1).max(50),
});

export const createOrderSchema = z.object({
  eventId: idSchema,
  lines: z.array(orderLineSchema).min(1, 'Choisis au moins un billet'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Coordonnées de l'acheteur.
 *
 * Le téléphone d'abord : c'est l'identifiant du produit, le canal de livraison
 * du billet, et le moyen de paiement. L'e-mail n'est qu'un secours.
 */
export const buyerDetailsSchema = z.object({
  buyerName: z.string().trim().min(2, 'Indique ton nom complet').max(120),
  buyerPhone: phoneSchema,
  buyerEmail: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  /** Nom par billet, si l'événement l'exige. */
  attendees: z
    .array(z.object({ ticketTypeId: idSchema, name: z.string().trim().min(2).max(120) }))
    .optional(),
});

export type BuyerDetailsInput = z.infer<typeof buyerDetailsSchema>;

/**
 * Confirmation du récapitulatif.
 *
 * Séparée des coordonnées, parce que le prototype la place à l'écran suivant :
 * on n'accepte pas des conditions de vente avant d'avoir vu le montant qu'elles
 * engagent. C'est ce passage — et lui seul — qui ouvre le paiement.
 */
export const confirmOrderSchema = z.object({
  termsAccepted: z.literal(true, {
    message: 'Tu dois accepter les conditions de vente pour continuer',
  }),
  whatsappOptIn: z.boolean().default(true),
});

export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Représentation
// ─────────────────────────────────────────────────────────────────────────────

export const orderItemSchema = z.object({
  id: idSchema,
  ticketTypeId: idSchema,
  ticketTypeName: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  subtotal: z.number().int(),
});

export const orderSchema = z.object({
  id: idSchema,
  reference: orderReferenceSchema,
  status: orderStatusSchema,

  eventId: idSchema,
  eventSlug: z.string(),
  eventTitle: z.string(),
  eventStartsAt: z.string(),
  eventVenueName: z.string().nullable(),
  eventCityName: z.string().nullable(),

  buyerName: z.string(),
  buyerPhone: z.string(),
  buyerEmail: z.string().nullable(),

  items: z.array(orderItemSchema),

  /** Décomposition intégrale : le prototype interdit toute surprise au récapitulatif. */
  subtotalAmount: z.number().int(),
  discountAmount: z.number().int(),
  buyerFeeAmount: z.number().int(),
  totalAmount: z.number().int(),
  currency: z.string(),

  /** Fin de la réservation des places. */
  expiresAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),

  /** Vrai si l'événement exige un nom par billet. */
  requiresAttendeeName: z.boolean(),
});

export type Order = z.infer<typeof orderSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Paiement
// ─────────────────────────────────────────────────────────────────────────────

export const initiatePaymentSchema = z.object({
  provider: paymentProviderSchema,
  /** Numéro Mobile Money à débiter. Souvent celui de l'acheteur, pas toujours. */
  payerPhone: phoneSchema,
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

export const paymentStateSchema = z.object({
  paymentId: idSchema,
  orderReference: orderReferenceSchema,
  status: paymentStatusSchema,
  provider: paymentProviderSchema,
  amount: z.number().int(),
  currency: z.string(),
  maskedPayerPhone: z.string(),
  /** Instant au-delà duquel la demande expire, pour le compte à rebours. */
  expiresAt: z.string().nullable(),
  /** Consigne opérateur : « Compose *880# … ». */
  instructions: z.string().nullable(),
  /**
   * Cause probable d'un échec, en français.
   * Le prototype interdit d'afficher un code brut seul.
   */
  failureReason: z.string().nullable(),
});

export type PaymentState = z.infer<typeof paymentStateSchema>;

/**
 * Moyens de paiement proposés.
 *
 * L'ordre est piloté par le back-office, jamais figé dans le code :
 * à Cotonou MTN d'abord, à Dakar Wave d'abord.
 */
export const paymentMethodSchema = z.object({
  provider: paymentProviderSchema,
  label: z.string(),
  description: z.string(),
  /** Groupe d'affichage : « Mobile Money · recommandé », « Autres moyens ». */
  group: z.enum(['mobile_money', 'other']),
  available: z.boolean(),
  /** Mention « Bientôt » sur un moyen prévu mais pas encore ouvert. */
  comingSoon: z.boolean(),
});

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * Catalogue par défaut des moyens de paiement.
 *
 * L'ordre reproduit celui de l'écran A3 du prototype. Il constitue un DÉFAUT,
 * pas une règle : le back-office pourra le réordonner par ville et par pays,
 * puisque l'opérateur dominant change d'un marché à l'autre.
 *
 * `available` n'est pas figé ici : il dépend des fournisseurs réellement
 * enregistrés côté serveur. Un moyen annoncé mais non branché s'afficherait
 * sinon comme utilisable, et échouerait au moment le plus coûteux du parcours.
 */
export const PAYMENT_METHOD_CATALOGUE: readonly Omit<PaymentMethod, 'available'>[] = [
  {
    provider: 'mtn_momo',
    label: 'MTN MoMo',
    description: 'Recommandé · validation par code USSD',
    group: 'mobile_money',
    comingSoon: false,
  },
  {
    provider: 'moov_money',
    label: 'Moov Money',
    description: 'Validation par code USSD',
    group: 'mobile_money',
    comingSoon: false,
  },
  {
    provider: 'celtiis_cash',
    label: 'Celtiis Cash',
    description: 'Validation par code USSD',
    group: 'mobile_money',
    comingSoon: false,
  },
  {
    provider: 'card',
    label: 'Carte bancaire',
    description: 'Visa · Mastercard',
    group: 'other',
    // Annoncée comme « Bientôt » : la carte suppose un contrat avec un
    // prestataire agréé, au même titre que les opérateurs Mobile Money. La
    // montrer comme disponible avant ce contrat ferait échouer le paiement au
    // moment le plus coûteux du parcours.
    comingSoon: true,
  },
  {
    provider: 'point_of_sale',
    label: 'Point de vente physique',
    description: 'Payer en espèces chez un revendeur agréé',
    group: 'other',
    comingSoon: true,
  },
  {
    provider: 'mock',
    label: 'Paiement de démonstration',
    description: 'Environnement de test · aucun montant réel n’est débité',
    group: 'other',
    comingSoon: false,
  },
];

/**
 * Le code secret Mobile Money ne transite JAMAIS par Nexa-Kabi.
 * Mention affichée sous la liste des moyens de paiement, écran A3.
 */
export const PAYMENT_SECURITY_NOTICE =
  'Nexa-Kabi ne demande jamais ton code secret. Tu valides le paiement directement ' +
  'sur ton téléphone, chez ton opérateur.';

// ─────────────────────────────────────────────────────────────────────────────
// Règles d'affichage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un paiement en attente n'est JAMAIS présenté comme un échec.
 *
 * Règle produit centrale : le Mobile Money est asynchrone, l'utilisateur quitte
 * l'écran pour valider sur son téléphone. Déclarer l'échec parce qu'un délai
 * navigateur est écoulé ferait abandonner des paiements qui aboutissent.
 */
export function isPaymentPending(status: z.infer<typeof paymentStatusSchema>): boolean {
  return status === 'INITIATED' || status === 'PENDING' || status === 'PROCESSING';
}

export function isPaymentTerminal(status: z.infer<typeof paymentStatusSchema>): boolean {
  return !isPaymentPending(status);
}

/** Transitions autorisées de la machine à états du paiement. */
export const PAYMENT_STATUS_TRANSITIONS: Readonly<
  Record<z.infer<typeof paymentStatusSchema>, readonly z.infer<typeof paymentStatusSchema>[]>
> = {
  INITIATED: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  PENDING: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'EXPIRED'],
  /**
   * Depuis un succès, seul le remboursement est possible.
   * Un webhook d'échec arrivant après un succès est journalisé et IGNORÉ :
   * l'argent a été encaissé, le billet est émis, revenir en arrière créerait
   * une incohérence bien pire que l'anomalie qu'on croit corriger.
   */
  SUCCEEDED: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
};

export function canTransitionPayment(
  from: z.infer<typeof paymentStatusSchema>,
  to: z.infer<typeof paymentStatusSchema>,
): boolean {
  return PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}
