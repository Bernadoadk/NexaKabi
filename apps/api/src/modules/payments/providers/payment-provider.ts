import type { PaymentProviderCode, PaymentStatus } from '@nexakabi/contracts';

export interface InitiatePaymentInput {
  readonly paymentId: string;
  readonly orderReference: string;
  readonly amount: number;
  readonly currency: string;
  /** Numéro Mobile Money du payeur, en E.164. */
  readonly payerPhone: string;
  readonly description: string;
}

export interface InitiatePaymentResult {
  /** Référence chez l'opérateur, à conserver pour la réconciliation. */
  readonly providerReference: string;
  readonly status: Extract<PaymentStatus, 'PENDING' | 'PROCESSING' | 'FAILED'>;
  /** Instant au-delà duquel l'opérateur abandonnera la demande. */
  readonly expiresAt: Date;
  /** Consigne affichée au participant : « Compose *880# … ». */
  readonly instructions?: string;
  /**
   * Motif d'un refus immédiat, en français.
   *
   * Certains refus sont connus dès l'initiation — solde insuffisant, numéro
   * inconnu, compte bloqué. Les taire ici forcerait l'écran d'échec à servir un
   * message générique, alors que la cause exacte est ce qui permet à l'acheteur
   * de se rattraper.
   */
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly rawResponse?: unknown;
}

export interface ProviderPaymentStatus {
  readonly status: PaymentStatus;
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly rawResponse?: unknown;
}

export interface RawWebhook {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly rawBody: string;
}

export interface NormalizedWebhookEvent {
  /** Identifiant de l'événement chez l'opérateur : la clé d'idempotence. */
  readonly externalId: string;
  readonly providerReference: string;
  readonly status: Extract<PaymentStatus, 'SUCCEEDED' | 'FAILED' | 'PROCESSING' | 'EXPIRED'>;
  readonly failureCode?: string;
  readonly failureReason?: string;
  /** Frais réellement prélevés par l'opérateur, si communiqués. */
  readonly providerFeeAmount?: number;
}

export interface RefundInput {
  readonly paymentId: string;
  readonly providerReference: string;
  readonly amount: number;
  readonly reason: string;
}

export interface RefundResult {
  readonly providerReference: string;
  readonly status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

/**
 * Demande de versement vers un organisateur.
 *
 * ── Pourquoi le nom du titulaire figure ici ──────────────────────────────
 * Les opérateurs Mobile Money le rapprochent du compte ciblé et refusent le
 * transfert quand il diverge. Ce contrôle nous rend service : c'est la même
 * concordance que la vérification a validée en amont, revérifiée par
 * l'opérateur au moment où l'argent part.
 */
export interface PayoutInput {
  /** Notre référence de retrait (`NKP-8F4C21`), pour le rapprochement. */
  readonly reference: string;
  /** Ce que l'organisateur reçoit, net de nos frais. */
  readonly amount: number;
  readonly currency: string;
  /** Numéro Mobile Money ou compte bancaire, au format E.164 pour le premier. */
  readonly accountNumber: string;
  readonly accountHolderName: string;
  /** Adresse de l'organisateur, si l'opérateur l'exige pour créer le bénéficiaire. */
  readonly email?: string;
}

export interface PayoutResult {
  readonly providerReference: string;
  /**
   * `PROCESSING` est l'issue NORMALE d'un versement Mobile Money : l'opérateur
   * accuse réception et transfère de façon asynchrone. Le passage à `PAID` vient
   * de l'interrogation (`getPayoutStatus`), jamais de cet appel.
   */
  readonly status: 'PROCESSING' | 'PAID' | 'FAILED';
  readonly failureReason?: string;
}

/** Ce que l'opérateur répond quand on lui demande où en est un versement. */
export interface ProviderPayoutStatus {
  readonly status: PayoutResult['status'];
  readonly failureReason?: string;
  readonly rawResponse?: unknown;
}

export class WebhookSignatureError extends Error {
  constructor(message = 'Signature du webhook invalide.') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Contrat d'un moyen de paiement.
 *
 * Chaque opérateur est un composant autonome : logo, libellé, champs propres,
 * message d'attente, règles de relance. Ajouter Wave, Orange Money ou un
 * agrégateur régional consiste à déposer une implémentation de plus — aucun
 * écran à redessiner, aucun service métier à modifier.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.2.
 */
export abstract class PaymentProvider {
  abstract readonly code: PaymentProviderCode;

  abstract readonly capabilities: {
    readonly refund: boolean;
    readonly partialRefund: boolean;
    readonly payout: boolean;
    readonly statusPolling: boolean;
  };

  /** Déclenche la demande de paiement côté opérateur. */
  abstract initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;

  /**
   * Interrogation de secours, quand le webhook tarde.
   * C'est le filet qui évite qu'un client payé reste sans billet.
   */
  abstract getStatus(providerReference: string): Promise<ProviderPaymentStatus>;

  /**
   * Vérifie la signature et normalise la charge utile entrante.
   * @throws WebhookSignatureError si la signature ne correspond pas.
   */
  abstract parseWebhook(raw: RawWebhook): Promise<NormalizedWebhookEvent>;

  abstract refund(input: RefundInput): Promise<RefundResult>;

  /**
   * Verse les recettes à un organisateur.
   *
   * ── Pourquoi la méthode est facultative, et le drapeau obligatoire ───────
   * `capabilities.payout` annonce si l'opérateur sait verser. Un fournisseur qui
   * répond `false` n'a pas à écrire une méthode qui lèverait — mais un qui
   * répond `true` DOIT l'implémenter.
   *
   * Cette signature existe parce que l'inverse s'était produit : le drapeau
   * était à `true` chez FedaPay sans qu'aucune méthode n'existe. Le registre
   * annonçait une capacité que rien ne fournissait, et seul un appel réel
   * l'aurait révélé.
   */
  payout?(input: PayoutInput): Promise<PayoutResult>;

  /**
   * Où en est un versement accepté par l'opérateur.
   *
   * ── Le trou que cette méthode bouche ─────────────────────────────────────
   * Un versement Mobile Money est accepté puis exécuté plus tard : `payout()`
   * répond `PROCESSING`, et rien, jusqu'ici, ne venait jamais dire s'il était
   * arrivé. Un retrait « en cours » le restait pour toujours, chez FedaPay
   * comme dans le simulateur. La réconciliation des retraits interroge cette
   * méthode chaque minute, exactement comme celle des paiements.
   *
   * Même règle que `payout` : facultative pour un fournisseur qui ne verse
   * pas, obligatoire pour celui qui annonce `capabilities.payout`.
   */
  getPayoutStatus?(providerReference: string): Promise<ProviderPayoutStatus>;
}
