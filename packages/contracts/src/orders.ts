/**
 * Contrat du tunnel d'achat.
 *
 * Cible du prototype : du lien WhatsApp au billet en poche en moins de
 * 90 secondes, et trois taps hors saisie du code Mobile Money.
 */

import { z } from 'zod';
import { emailSchema, idSchema, orderReferenceSchema, phoneSchema } from './common.js';
import {
  orderStatusSchema,
  paymentMethodCodeSchema,
  paymentProviderSchema,
  paymentStatusSchema,
} from './enums.js';
import { countryCodeSchema, paymentWidgetSchema } from './payments.js';

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
  /** Pays de paiement : celui de l'événement. Fixe la devise et les moyens proposés. */
  countryCode: countryCodeSchema,

  /** Fin de la réservation des places. */
  expiresAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),

  /** Vrai si l'événement exige un nom par billet. */
  requiresAttendeeName: z.boolean(),

  /**
   * Remboursement de la commande, s'il y en a un.
   *
   * Décidé n'est pas encore rendu : un remboursement se fait parfois à la
   * main, des jours après la décision. Tant que l'argent n'est pas reparti
   * vers lui, le participant doit lire « en cours », pas « remboursée ».
   */
  refund: z
    .object({
      state: z.enum(['IN_PROGRESS', 'COMPLETED']),
      amount: z.number().int(),
    })
    .nullable(),
});

export type Order = z.infer<typeof orderSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Paiement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Demande de paiement.
 *
 * Le participant choisit un MOYEN — jamais un prestataire. Le numéro n'est
 * exigé que pour le Mobile Money, et il appartient au pays de la commande :
 * un payeur sénégalais donne un numéro en +221. Sa validation se fait donc
 * côté serveur, contre la règle du pays, pas ici où le pays est inconnu.
 */
export const initiatePaymentSchema = z.object({
  method: paymentMethodCodeSchema,
  /** Numéro Mobile Money à débiter. Souvent celui de l'acheteur, pas toujours. */
  payerPhone: z.string().trim().max(32).optional(),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

/**
 * Référence de transaction rendue par la fenêtre de paiement du prestataire.
 *
 * Ce n'est PAS une preuve : n'importe quel script de la page peut l'inventer.
 * C'est une piste — le serveur va lire cette transaction chez le prestataire,
 * vérifie qu'elle appartient bien à CE paiement et porte le bon montant, et
 * n'agit que sur ce qu'il y lit.
 */
export const confirmPaymentSchema = z.object({
  providerReference: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, 'Référence de transaction invalide'),
});

export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

export const paymentStateSchema = z.object({
  paymentId: idSchema,
  orderReference: orderReferenceSchema,
  status: paymentStatusSchema,
  /** Moyen choisi par le participant. */
  method: paymentMethodCodeSchema,
  methodLabel: z.string(),
  /** Prestataire qui traite — information de diagnostic, jamais mise en avant. */
  provider: paymentProviderSchema,
  amount: z.number().int(),
  currency: z.string(),
  maskedPayerPhone: z.string(),
  /** Instant au-delà duquel la demande expire, pour le compte à rebours. */
  expiresAt: z.string().nullable(),
  /** Consigne opérateur : « Compose *880# … ». */
  instructions: z.string().nullable(),
  /**
   * Page du prestataire où le paiement se poursuit — carte bancaire. Le
   * tunnel y envoie le participant, qui revient ensuite sur l'écran d'attente.
   */
  redirectUrl: z.string().nullable(),
  /**
   * Lien de validation d'un Mobile Money qui ne passe pas par USSD (Wave,
   * simulateur du bac à sable) : proposé sur l'écran d'attente, ouvert à
   * côté — l'écran reste là et interroge l'état.
   */
  confirmationUrl: z.string().nullable(),
  /**
   * Fenêtre de paiement du prestataire, à ouvrir par-dessus l'écran — tant que
   * le paiement attend. `null` pour un paiement qui se valide sur le téléphone
   * ou sur une page du prestataire.
   */
  widget: paymentWidgetSchema.nullable(),
  /**
   * Cause probable d'un échec, en français.
   * Le prototype interdit d'afficher un code brut seul.
   *
   * Présente sur un paiement ENCORE en attente, elle dit que la dernière
   * tentative dans la fenêtre du prestataire a échoué : l'acheteur peut en
   * refaire une, sur le même paiement.
   */
  failureReason: z.string().nullable(),
});

export type PaymentState = z.infer<typeof paymentStateSchema>;

/**
 * Les moyens de paiement proposés au participant ne sont plus un catalogue
 * figé : ils se génèrent depuis la configuration du pays de la commande.
 * Voir `checkoutPaymentMethodsSchema` dans `payments.ts`.
 */

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
  /**
   * Un échec, une expiration ou un abandon ne peuvent plus devenir QUE des
   * succès — et seulement quand le prestataire confirme avoir encaissé.
   *
   * Cela arrive : l'acheteur valide dans la fenêtre de paiement une minute
   * après la fin de sa réservation, ou la confirmation de l'opérateur arrive
   * après que nous avons renoncé. L'argent est parti ; refuser de le voir le
   * laisserait sans billet ET sans trace. Le paiement passe donc à `SUCCEEDED`
   * — et la commande est honorée si ses places sont encore libres, signalée
   * au rapprochement sinon (voir `PaymentsService.applyOutcome`).
   */
  FAILED: ['SUCCEEDED'],
  EXPIRED: ['SUCCEEDED'],
  CANCELLED: ['SUCCEEDED'],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
};

export function canTransitionPayment(
  from: z.infer<typeof paymentStatusSchema>,
  to: z.infer<typeof paymentStatusSchema>,
): boolean {
  return PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}
