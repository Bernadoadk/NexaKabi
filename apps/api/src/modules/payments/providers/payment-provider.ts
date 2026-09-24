import type {
  CheckoutFlow,
  PaymentMethodCode,
  PaymentMethodKind,
  PaymentProviderCode,
  PaymentStatus,
  PaymentWidget,
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
  /**
   * Référence chez le prestataire, à conserver pour la réconciliation.
   *
   * Absente quand le paiement se fait dans la fenêtre du prestataire : la
   * transaction n'y existe qu'une fois que l'acheteur a validé, et sa
   * référence arrive ensuite — par la page, ou par la notification.
   */
  readonly providerReference?: string;
  readonly status: Extract<PaymentStatus, 'PENDING' | 'PROCESSING' | 'FAILED'>;
  /**
   * Instant au-delà duquel le prestataire abandonnera la demande. Absent :
   * le paiement vit aussi longtemps que la réservation de la commande.
   */
  readonly expiresAt?: Date;
  /**
   * Fenêtre de paiement à ouvrir dans la page (`checkoutFlow` = `widget`).
   * Ne porte que ce qu'un navigateur peut voir — jamais une clé privée.
   */
  readonly widget?: PaymentWidget;
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
  /**
   * Frais que le prestataire a retenus SUR NOUS, s'il le dit. Des frais payés
   * par l'acheteur en plus du prix n'en font pas partie : ils ne réduisent
   * pas ce que nous encaissons. Absent : inconnu.
   */
  readonly providerFeeAmount?: number;
  /**
   * Montant de la transaction chez le prestataire, et notre référence telle
   * qu'il nous la renvoie. Les deux servent à LIER une transaction à un
   * paiement : une référence rendue par une page ne vaut rien tant que le
   * prestataire ne confirme pas qu'elle porte notre identifiant et le bon
   * montant.
   */
  readonly amount?: number;
  readonly merchantReference?: string;
  /** Numéro débité, en E.164, quand le prestataire le communique. */
  readonly payerPhone?: string;
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
export type NormalizedWebhookEvent =
  | NormalizedPaymentWebhook
  | NormalizedPayoutWebhook
  | NormalizedRefundWebhook;

export interface NormalizedPaymentWebhook {
  readonly kind: 'payment';
  /** Identifiant de l'événement chez le prestataire : la clé d'idempotence. */
  readonly externalId: string;
  readonly providerReference: string;
  /**
   * Notre identifiant de paiement, tel que le prestataire le renvoie.
   *
   * Indispensable quand le paiement se fait dans la fenêtre du prestataire :
   * la notification peut arriver avant que la page nous ait transmis la
   * référence de la transaction — elle est alors la seule à pouvoir dire de
   * quel paiement il s'agit.
   */
  readonly merchantReference?: string;
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

/**
 * Issue d'un remboursement, annoncée par le prestataire.
 *
 * Les deux références sont facultatives, mais il en faut une : celle du
 * prestataire quand sa notification la porte, et à défaut la nôtre
 * (`refundKey`), qu'il renvoie telle qu'on la lui a donnée.
 */
export interface NormalizedRefundWebhook {
  readonly kind: 'refund';
  readonly externalId: string;
  readonly providerReference?: string;
  readonly merchantReference?: string;
  readonly status: 'COMPLETED' | 'FAILED';
  readonly failureReason?: string;
}

/** Notification qui ne concerne ni un paiement ni un versement — ignorée. */
export class WebhookIgnoredError extends Error {
  constructor(message = 'Notification sans objet pour nous.') {
    super(message);
    this.name = 'WebhookIgnoredError';
  }
}

/**
 * Le prestataire ne connaît pas cette transaction — ou elle n'est pas un
 * paiement.
 *
 * Distincte d'une panne : une panne se retente, une référence inconnue non.
 * La page qui l'a transmise s'est trompée, ou l'a inventée.
 */
export class ProviderTransactionNotFoundError extends Error {
  constructor(message = 'Transaction inconnue du prestataire.') {
    super(message);
    this.name = 'ProviderTransactionNotFoundError';
  }
}

export interface RefundInput {
  /**
   * Notre clé d'idempotence pour cette demande : reçue deux fois, elle ne
   * rembourse qu'une fois. Elle ne change qu'après un refus pour lequel le
   * prestataire a créé une transaction — voir `RefundsService`.
   */
  readonly refundKey: string;
  readonly paymentId: string;
  /** Référence du PAIEMENT à rembourser, chez le prestataire. */
  readonly providerReference: string;
  readonly amount: number;
  readonly currency: string;
  readonly reason: string;
  /** Numéro débité à l'achat : c'est lui qu'un remboursement recrédite. */
  readonly payerPhone?: string;
}

export interface RefundResult {
  /** Référence du remboursement chez le prestataire. Absente s'il a refusé sans rien créer. */
  readonly providerReference?: string;
  /**
   * `PROCESSING` est l'issue normale d'un remboursement Mobile Money : accepté,
   * puis exécuté. `FAILED` est un refus DÉFINITIF, rien n'a bougé. Une réponse
   * perdue n'est ni l'un ni l'autre : la méthode lève alors une erreur.
   */
  readonly status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  readonly failureReason?: string;
  readonly rawResponse?: unknown;
}

/** Ce que le prestataire répond quand on lui demande où en est un remboursement. */
export interface ProviderRefundStatus {
  readonly status: RefundResult['status'];
  readonly failureReason?: string;
  readonly rawResponse?: unknown;
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

/** Solde de notre compte chez le prestataire, dans une devise. */
export interface ProviderBalance {
  readonly currency: string;
  readonly balance: number;
  /** Réservé : remboursements et retraits en cours d'exécution. */
  readonly reserved: number;
  readonly available: number;
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
 * seule API : Kkiapay encaisse MTN, Moov et la carte au Bénin. Le moyen et le
 * pays lui sont donc PASSÉS à chaque appel ; il n'en porte aucun en dur.
 * Ajouter un prestataire consiste à déposer une implémentation de plus —
 * aucun écran à redessiner, aucun service métier à modifier.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.2.
 */
export abstract class PaymentProvider {
  abstract readonly code: PaymentProviderCode;

  abstract readonly capabilities: {
    readonly refund: boolean;
    readonly partialRefund: boolean;
    /**
     * Natures de paiement que le prestataire sait rembourser par API —
     * Kkiapay ne documente que le Mobile Money. `null` : toutes. Hors de
     * cette liste, le remboursement reste dû et se fait à la main.
     */
    readonly refundMethodKinds: readonly PaymentMethodKind[] | null;
    /**
     * Jours après l'encaissement au-delà desquels le prestataire refuse de
     * rembourser. `null` : aucune limite connue. Au-delà, le remboursement
     * reste dû et se fait à la main.
     */
    readonly refundWindowDays: number | null;
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

  /**
   * Comment l'acheteur valide un paiement de cette nature chez ce
   * prestataire — sur son téléphone (`push`), sur une page du prestataire
   * (`redirect`) ou dans sa fenêtre de paiement (`widget`). L'écran de choix
   * et le service de paiement s'y règlent ; aucun ne connaît le prestataire.
   */
  abstract checkoutFlow(kind: PaymentMethodKind): CheckoutFlow;

  /** Déclenche la demande de paiement côté prestataire. */
  abstract initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;

  /**
   * Reconstruit la fenêtre de paiement d'un paiement DÉJÀ lancé — rouvrir la
   * fenêtre fermée par l'acheteur, reprendre après un rechargement de page,
   * changer de famille de paiement. Obligatoire pour un prestataire dont un
   * moyen se valide en `widget`, sans objet pour les autres.
   */
  widget?(input: InitiatePaymentInput): PaymentWidget;

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

  /**
   * Demande le remboursement d'un paiement.
   * @throws quand l'issue est INCONNUE — réponse perdue, prestataire
   * injoignable. Un refus explicite se renvoie en `FAILED`, sans lever.
   */
  abstract refund(input: RefundInput): Promise<RefundResult>;

  /**
   * Où en est un remboursement accepté.
   *
   * Même rôle que `getPayoutStatus` : un remboursement asynchrone se conclut
   * par un webhook, ou par cette interrogation quand le webhook se perd.
   * Facultatif : un prestataire qui rembourse sur-le-champ n'en a pas besoin.
   */
  getRefundStatus?(providerReference: string): Promise<ProviderRefundStatus>;

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
   * `transactionId` chez Kkiapay : la chercher ici évite de coder un format
   * dans le service de réconciliation, où elle divergerait au premier
   * prestataire ajouté.
   */
  extractProviderReference?(rawBody: string): string | null;

  /**
   * Retrouve NOTRE identifiant de paiement dans un corps de notification
   * conservé, quand le prestataire le renvoie (`partnerId` chez Kkiapay).
   * Même usage, et même absence de confiance, que la méthode précédente.
   */
  extractMerchantReference?(rawBody: string): string | null;

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

  /**
   * Solde de notre compte chez le prestataire.
   *
   * Sert au rapprochement : ce que le prestataire dit détenir, face à ce que
   * nos écritures disent qu'il devrait détenir. Facultatif — un prestataire
   * qui ne l'expose pas se rapproche sans cette ligne.
   */
  getBalance?(): Promise<ProviderBalance[]>;
}
