import type {
  PaymentMethodCode,
  PaymentMethodKind,
  PaymentProviderCode,
  PaymentStatus,
} from '@nexakabi/contracts';

/**
 * Le moyen de paiement tel qu'un prestataire doit le recevoir.
 *
 * `code` est le nôtre (`mtn_momo`), `providerMethodCode` est le sien
 * (`mtn_money`). La correspondance vient de la configuration du pays, jamais
 * d'une table figée dans le fournisseur.
 */
export interface ProviderMethod {
  readonly code: PaymentMethodCode;
  readonly kind: PaymentMethodKind;
  readonly providerMethodCode: string;
}

export interface InitiatePaymentInput {
  readonly paymentId: string;
  readonly orderReference: string;
  readonly amount: number;
  readonly currency: string;
  /** Pays de paiement, ISO alpha-2. Les prestataires multi-pays l'exigent. */
  readonly countryCode: string;
  readonly method: ProviderMethod;
  /** Numéro Mobile Money du payeur, en E.164. Absent pour une carte. */
  readonly payerPhone?: string;
  readonly customer: {
    readonly name: string;
    readonly phone: string;
    readonly email?: string;
  };
  readonly description: string;
  /**
   * Où renvoyer le participant après un paiement sur une page du prestataire.
   * Ignoré par les moyens qui se valident sur le téléphone.
   */
  readonly returnUrls: {
    readonly success: string;
    readonly error: string;
  };
}

export interface InitiatePaymentResult {
  /** Référence chez le prestataire, à conserver pour la réconciliation. */
  readonly providerReference: string;
  readonly status: Extract<PaymentStatus, 'PENDING' | 'PROCESSING' | 'FAILED'>;
  /** Instant au-delà duquel le prestataire abandonnera la demande. */
  readonly expiresAt: Date;
  /** Consigne affichée au participant : « Compose *880# … ». */
  readonly instructions?: string;
  /**
   * Page du prestataire où le paiement se poursuit — carte bancaire. Le
   * tunnel y ENVOIE le participant, qui revient ensuite sur l'écran d'attente.
   */
  readonly redirectUrl?: string;
  /**
   * Lien de validation d'un paiement Mobile Money qui ne passe pas par USSD —
   * l'application Wave, ou le simulateur du bac à sable. Proposé sur l'écran
   * d'attente, à ouvrir À CÔTÉ : l'écran reste là et interroge l'état, parce
   * que le prestataire ne renvoie pas toujours le participant après.
   */
  readonly confirmationUrl?: string;
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
  /** Frais réellement prélevés par le prestataire, s'il les communique. */
  readonly providerFeeAmount?: number;
  readonly rawResponse?: unknown;
}

export interface RawWebhook {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly rawBody: string;
}

/**
 * Notification normalisée.
 *
 * `kind` sépare ce qui concerne un ENCAISSEMENT de ce qui concerne un
 * VERSEMENT : les deux arrivent par le même point de terminaison chez la
 * plupart des prestataires, et ne se traitent pas au même endroit.
 */
export type NormalizedWebhookEvent = NormalizedPaymentWebhook | NormalizedPayoutWebhook;

export interface NormalizedPaymentWebhook {
  readonly kind: 'payment';
  /** Identifiant de l'événement chez le prestataire : la clé d'idempotence. */
  readonly externalId: string;
  readonly providerReference: string;
  readonly status: Extract<PaymentStatus, 'SUCCEEDED' | 'FAILED' | 'PROCESSING' | 'EXPIRED'>;
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly providerFeeAmount?: number;
  /**
   * Montant et devise ANNONCÉS par la notification, quand elle les porte.
   *
   * Rapprochés de ceux du paiement avant tout crédit : une notification
   * authentique qui annonce 500 F sur une commande de 50 000 F désigne soit
   * une erreur du prestataire, soit une notification détournée d'une autre
   * transaction. Dans les deux cas, émettre les billets serait la mauvaise
   * réponse. Absents, le contrôle est simplement sauté — un prestataire qui
   * ne les envoie pas n'est pas pour autant suspect.
   */
  readonly amount?: number;
  readonly currency?: string;
}

export interface NormalizedPayoutWebhook {
  readonly kind: 'payout';
  readonly externalId: string;
  readonly providerReference: string;
  readonly status: 'PROCESSING' | 'PAID' | 'FAILED';
  readonly failureReason?: string;
}

/** Notification qui ne concerne ni un paiement ni un versement — ignorée. */
export class WebhookIgnoredError extends Error {
  constructor(message = 'Notification sans objet pour nous.') {
    super(message);
    this.name = 'WebhookIgnoredError';
  }
}

export interface RefundInput {
  readonly paymentId: string;
  readonly providerReference: string;
  readonly amount: number;
  readonly currency: string;
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
  /** Pays du compte de réception. */
  readonly countryCode: string;
  readonly method: ProviderMethod;
  /** Numéro Mobile Money ou compte bancaire, au format E.164 pour le premier. */
  readonly accountNumber: string;
  readonly accountHolderName: string;
  /** Adresse de l'organisateur, si le prestataire l'exige pour créer le bénéficiaire. */
  readonly email?: string;
}

export interface PayoutResult {
  readonly providerReference: string;
  /**
   * `PROCESSING` est l'issue NORMALE d'un versement Mobile Money : le prestataire
   * accuse réception et transfère de façon asynchrone. Le passage à `PAID` vient
   * de l'interrogation (`getPayoutStatus`) ou d'un webhook, jamais de cet appel.
   */
  readonly status: 'PROCESSING' | 'PAID' | 'FAILED';
  readonly failureReason?: string;
}

/** Ce que le prestataire répond quand on lui demande où en est un versement. */
export interface ProviderPayoutStatus {
  readonly status: PayoutResult['status'];
  readonly failureReason?: string;
  readonly rawResponse?: unknown;
}

/**
 * Un moyen tel que le compte marchand le déclare chez le prestataire.
 * Sert à la synchronisation : constater, pays par pays, ce qui est
 * réellement ouvert en collecte et en versement.
 */
export interface MerchantMethod {
  readonly countryCode: string;
  readonly providerMethodCode: string;
  readonly collection: boolean;
  readonly payout: boolean;
}

/**
 * État opérationnel d'un moyen chez le prestataire, à l'instant du relevé.
 *
 * `countryCode` est en ISO alpha-2 — le nôtre. C'est à l'implémentation de
 * convertir depuis ce que parle son API : rien au-dessus ne doit connaître
 * les conventions d'un prestataire.
 */
export interface ProviderAvailability {
  readonly countryCode: string;
  readonly providerMethodCode: string;
  readonly operation: 'COLLECTION' | 'PAYOUT';
  readonly status: 'OPERATIONAL' | 'DELAYED' | 'CLOSED';
}

export class WebhookSignatureError extends Error {
  constructor(message = 'Signature du webhook invalide.') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Contrat d'un PRESTATAIRE de paiement.
 *
 * Un prestataire traite plusieurs moyens dans plusieurs pays derrière une
 * seule API : Bictorys encaisse MTN, Wave, Orange Money et la carte. Le
 * moyen et le pays lui sont donc PASSÉS à chaque appel ; il n'en porte aucun
 * en dur. Ajouter un prestataire consiste à déposer une implémentation de
 * plus — aucun écran à redessiner, aucun service métier à modifier.
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
    /**
     * Vrai quand un webhook ne prouve pas à lui seul ce qu'il annonce — secret
     * partagé sans signature du corps, par exemple. Le service relit alors
     * l'état chez le prestataire AVANT de créditer quoi que ce soit : la
     * notification est un signal, la vérité se va chercher à la source.
     */
    readonly verifyWebhookByFetch: boolean;
  };

  /** Déclenche la demande de paiement côté prestataire. */
  abstract initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;

  /**
   * Interrogation de secours, quand le webhook tarde.
   * C'est le filet qui évite qu'un client payé reste sans billet.
   */
  abstract getStatus(providerReference: string): Promise<ProviderPaymentStatus>;

  /**
   * Vérifie l'authenticité et normalise la charge utile entrante.
   * @throws WebhookSignatureError si l'authentification échoue.
   * @throws WebhookIgnoredError si la notification ne nous concerne pas.
   */
  abstract parseWebhook(raw: RawWebhook): Promise<NormalizedWebhookEvent>;

  abstract refund(input: RefundInput): Promise<RefundResult>;

  /**
   * Verse les recettes à un organisateur.
   *
   * ── Pourquoi la méthode est facultative, et le drapeau obligatoire ───────
   * `capabilities.payout` annonce si le prestataire sait verser. Un fournisseur
   * qui répond `false` n'a pas à écrire une méthode qui lèverait — mais un qui
   * répond `true` DOIT l'implémenter. Le registre le vérifie au démarrage.
   */
  payout?(input: PayoutInput): Promise<PayoutResult>;

  /**
   * Où en est un versement accepté par le prestataire.
   *
   * Un versement Mobile Money est accepté puis exécuté plus tard : `payout()`
   * répond `PROCESSING`, et c'est cette méthode — interrogée chaque minute —
   * ou un webhook qui dit ensuite s'il est arrivé.
   */
  getPayoutStatus?(providerReference: string): Promise<ProviderPayoutStatus>;

  /**
   * Moyens ouverts sur le compte marchand, tels que le prestataire les
   * déclare. Facultatif : un prestataire qui ne l'expose pas se configure à
   * la main, sans constat.
   */
  listMerchantMethods?(): Promise<MerchantMethod[]>;

  /**
   * Retrouve sa référence dans un corps de notification CONSERVÉ.
   *
   * ── Pourquoi ce n'est pas `parseWebhook` ────────────────────────────────
   * Une notification arrivée avant que notre transaction d'initiation soit
   * validée est gardée telle quelle, sans ses en-têtes — donc sans sa
   * signature. La réconciliation doit pouvoir dire de QUEL paiement elle
   * parlait, ce qui ne demande aucune confiance : rien n'est décidé sur la
   * foi de ce corps. Une fois le paiement retrouvé, son état est relu chez le
   * prestataire, et c'est cette lecture qui fait autorité.
   *
   * Chaque prestataire nomme cette référence à sa façon — `id` chez Bictorys,
   * `paymentId` chez KPay : la chercher ici évite de coder un format dans le
   * service de réconciliation, où elle divergerait au premier prestataire
   * ajouté.
   */
  extractProviderReference?(rawBody: string): string | null;

  /**
   * État opérationnel de chaque moyen, en ce moment.
   *
   * ── Ce que cela change pour l'acheteur ──────────────────────────────────
   * Un opérateur tombe en panne plusieurs fois par an, sans prévenir. Sans ce
   * relevé, le moyen reste affiché, l'acheteur saisit son numéro, attend trois
   * minutes et voit un échec — puis s'en va. Avec lui, le moyen disparaît de
   * l'écran le temps de la panne, ou porte la mention « retards en cours »
   * quand il fonctionne au ralenti.
   *
   * Facultatif : un prestataire qui ne l'expose pas laisse tout à `UNKNOWN`,
   * et rien n'est fermé. L'ignorance ne vaut pas panne.
   */
  listAvailability?(): Promise<ProviderAvailability[]>;
}
