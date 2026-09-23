import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentProviderCode, PaymentStatus } from '@nexakabi/contracts';
import type { Env } from '../../../config/env';
import {
  PaymentProvider,
  WebhookIgnoredError,
  WebhookSignatureError,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type NormalizedWebhookEvent,
  type PayoutInput,
  type ProviderAvailability,
  type PayoutResult,
  type ProviderPaymentStatus,
  type ProviderPayoutStatus,
  type RawWebhook,
  type RefundInput,
  type RefundResult,
} from './payment-provider';

/**
 * KPay — Mobile Money en Afrique de l'Ouest et centrale.
 *
 * ── Ce qu'il traite pour nous ───────────────────────────────────────────────
 * Le Mobile Money, en mode USSD : la demande part vers le téléphone du payeur,
 * qui valide avec son code. Bénin (MTN, Moov), Côte d'Ivoire (MTN, Orange),
 * Sénégal (Orange, Free) — tous en XOF, sans décimales, ce qui correspond
 * exactement à notre règle des montants entiers.
 *
 * ── Ce qu'il ne traite PAS, et pourquoi ─────────────────────────────────────
 * La carte. KPay l'accepte, mais sa page hébergée facture **en USD** avec un
 * minimum d'un dollar, l'acheteur réglant l'équivalent en monnaie locale sur
 * la page de Stripe. Une commande Nexa-Kabi est un entier de francs CFA :
 * la faire passer par une conversion dont nous ne maîtrisons ni le taux ni
 * l'arrondi ferait diverger le montant encaissé du montant dû, et le grand
 * livre avec. `card` est donc absent de son catalogue dans `payments.ts`, et la
 * console refuse de le lui confier.
 *
 * Le remboursement. Son API n'expose aucun point de terminaison pour cela —
 * seulement des notifications `refund.*` pour des remboursements décidés depuis
 * son tableau de bord. `capabilities.refund` vaut donc `false`, et le service
 * de remboursement dit clairement qu'il faut le faire à la main.
 *
 * ── Les appels ──────────────────────────────────────────────────────────────
 *   Encaissement   POST /api/v1/payments/init           (USSD, `provider` + numéro)
 *   Statut         GET  /api/v1/payments/:id
 *   Versement      POST /api/v1/payments/withdraw
 *   Statut versem. GET  /api/v1/payments/withdraw/:id
 *   Compte         GET  /api/v1/payments/me             (diagnostic des clés)
 *
 * ── Le webhook est signé, et pourtant relu ──────────────────────────────────
 * KPay signe le corps en HMAC-SHA256 (`X-KPAY-Signature`), ce qui est déjà
 * beaucoup mieux qu'un secret partagé. Sa propre documentation pose néanmoins
 * la règle : « ne marquez la commande payée qu'après un statut COMPLETED
 * confirmé par GET /api/v1/payments/:id ». `verifyWebhookByFetch` applique
 * cette règle — la notification dit « regarde », la lecture dit « voilà ».
 *
 * ── L'environnement est dans la clé ─────────────────────────────────────────
 * Une seule adresse, et c'est le préfixe de la clé qui décide si l'argent
 * bouge : `kpay_test_` simule, `kpay_live_` débite. La cohérence entre ce
 * préfixe et `NODE_ENV` est vérifiée au démarrage (`config/env.ts`).
 *
 * Documentation : https://kpay.site/documentation
 */

/** Statuts renvoyés par l'API, pour un paiement comme pour un versement. */
type KpayStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface KpayTransaction {
  id?: string;
  reference?: string;
  providerReference?: string;
  status?: KpayStatus | string;
  mode?: string;
  amount?: number;
  netAmount?: number;
  /** Commission prélevée par KPay, en unités entières de la devise. */
  feeAmount?: number;
  currency?: string;
  externalId?: string;
  provider?: string;
  country?: string;
  phoneNumber?: string;
  isTest?: boolean;
  message?: string;
  failureCode?: string;
  failureReason?: string;
  gatewayUrl?: string;
  expiresAt?: string;
}

/** Corps d'une notification. Le nom du champ d'identifiant varie selon l'objet. */
interface KpayWebhookPayload {
  event?: string;
  paymentId?: string;
  payoutId?: string;
  refundId?: string;
  reference?: string;
  status?: KpayStatus | string;
  amount?: number;
  feeAmount?: number;
  currency?: string;
  phoneNumber?: string;
  externalId?: string;
  failureCode?: string;
  failureReason?: string;
  completedAt?: string | null;
  failedAt?: string | null;
  timestamp?: string;
}

interface KpayErrorBody {
  statusCode?: number;
  message?: string;
  error?: string;
}

/** Réponse de `GET /api/v1/payments/availability`, un objet par pays. */
interface KpayAvailabilityCountry {
  country?: string;
  providers?: {
    provider?: string;
    operationTypes?: { operationType?: string; status?: string }[];
  }[];
}

/**
 * Pays de KPay (ISO alpha-3) vers les nôtres (alpha-2).
 *
 * Limitée aux douze pays de son catalogue : une table plus large donnerait
 * l'illusion d'une couverture qu'il n'a pas. Un pays inconnu est ignoré.
 */
const ALPHA3_TO_ALPHA2: Readonly<Record<string, string>> = {
  BEN: 'BJ',
  CIV: 'CI',
  SEN: 'SN',
  CMR: 'CM',
  COD: 'CD',
  COG: 'CG',
  GAB: 'GA',
  KEN: 'KE',
  RWA: 'RW',
  SLE: 'SL',
  UGA: 'UG',
  ZMB: 'ZM',
  GHA: 'GH',
};

/**
 * Délai au-delà duquel une demande Mobile Money non validée est abandonnée.
 *
 * KPay ne l'impose pas en mode USSD ; c'est NOTRE délai, celui qu'affiche le
 * compte à rebours de l'écran d'attente. Le tenir vaut mieux que de laisser un
 * compte à rebours mentir.
 */
const MOBILE_REQUEST_TIMEOUT_MINUTES = 3;

const REQUEST_TIMEOUT_MS = 20_000;

@Injectable()
export class KpayProvider extends PaymentProvider {
  readonly code: PaymentProviderCode = 'kpay';

  readonly capabilities = {
    /** Aucun point de terminaison de remboursement dans son API. */
    refund: false,
    partialRefund: false,
    payout: true,
    statusPolling: true,
    /** Sa documentation l'exige, signature ou non. Voir l'en-tête du fichier. */
    verifyWebhookByFetch: true,
  };

  private readonly logger = new Logger(KpayProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(config: ConfigService<Env, true>) {
    super();

    this.baseUrl = config.get('KPAY_API_URL', { infer: true }).replace(/\/+$/, '');
    this.apiKey = config.get('KPAY_API_KEY', { infer: true });
    this.secretKey = config.get('KPAY_SECRET_KEY', { infer: true });
    this.webhookSecret = config.get('KPAY_WEBHOOK_SECRET', { infer: true });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Encaissement
  // ───────────────────────────────────────────────────────────────────────────

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    if (input.method.kind !== 'MOBILE_MONEY') {
      // Le routage ne devrait jamais en arriver là : `card` n'est pas dans son
      // catalogue. Si cela se produit, le dire précisément vaut mieux que de
      // laisser KPay répondre 400 sur un corps incomplet.
      throw new Error(
        `KPay ne traite que le Mobile Money chez nous ; ${input.method.code} lui a été demandé.`,
      );
    }

    if (!input.payerPhone) {
      throw new Error('KPay exige le numéro Mobile Money à débiter.');
    }

    const expiresAt = new Date(Date.now() + MOBILE_REQUEST_TIMEOUT_MINUTES * 60 * 1000);

    const body = {
      amount: input.amount,
      // Le code porte l'opérateur ET le pays (`MTN_MOMO_BEN`) : c'est lui qui
      // détermine la devise chez KPay, il n'y a aucune détection automatique.
      provider: input.method.providerMethodCode,
      phoneNumber: toLocalDialFormat(input.payerPhone),
      // Notre identifiant de paiement EST la clé d'idempotence de KPay : un
      // second appel avec la même valeur est refusé (409) au lieu de créer un
      // doublon. Le nôtre est déjà unique par construction.
      externalId: input.paymentId,
      description: input.description,
      customerName: input.customer.name,
      ...(input.customer.email ? { customerEmail: input.customer.email } : {}),
      // Renvoyé tel quel dans le statut : de quoi rapprocher une transaction
      // depuis le tableau de bord de KPay sans passer par notre base.
      metadata: { orderReference: input.orderReference },
    };

    const response = await this.request<KpayTransaction>('POST', '/api/v1/payments/init', body);

    const providerReference = response.id;

    if (!providerReference) {
      throw new Error(
        `KPay n'a pas renvoyé d'identifiant de paiement (${response.status ?? 'statut absent'}).`,
      );
    }

    const status = normalizeStatus(response.status);

    if (status === 'FAILED' || status === 'CANCELLED') {
      return {
        providerReference,
        status: 'FAILED',
        expiresAt,
        failureCode: response.failureCode ?? 'DECLINED',
        failureReason: describeFailure(response.failureReason ?? response.message),
        rawResponse: response,
      };
    }

    return {
      providerReference,
      status: status === 'PROCESSING' ? 'PROCESSING' : 'PENDING',
      expiresAt,
      // « Le client doit valider la demande sur son téléphone. » — affiché tel
      // quel sur l'écran d'attente, sous « Tu n'as rien reçu ? ».
      instructions: response.message ?? undefined,
      rawResponse: response,
    };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    const transaction = await this.request<KpayTransaction>(
      'GET',
      `/api/v1/payments/${encodeURIComponent(providerReference)}`,
    );

    const status = normalizeStatus(transaction.status);
    const failed = status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED';

    return {
      status,
      failureCode: failed ? (transaction.failureCode ?? String(transaction.status)) : undefined,
      failureReason: failed
        ? describeFailure(transaction.failureReason ?? transaction.message)
        : undefined,
      // La commission réellement prélevée, telle que KPay l'annonce : c'est
      // elle que le grand livre consigne en `PROVIDER_FEE`.
      providerFeeAmount: transaction.feeAmount,
      rawResponse: transaction,
    };
  }

  async parseWebhook(raw: RawWebhook): Promise<NormalizedWebhookEvent> {
    // Authentification AVANT toute lecture du corps, sur le corps BRUT : un
    // `JSON.parse` suivi d'un `JSON.stringify` change les espaces et invalide
    // la signature.
    this.assertSignature(raw.rawBody, firstHeader(raw.headers['x-kpay-signature']));

    const payload = JSON.parse(raw.rawBody) as KpayWebhookPayload;
    const event = payload.event ?? firstHeader(raw.headers['x-kpay-event']) ?? '';

    if (!payload.status) {
      throw new Error('Notification KPay incomplète : statut absent.');
    }

    const status = normalizeStatus(payload.status);
    const failed = status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED';

    if (event.startsWith('payout.')) {
      const providerReference = payload.payoutId ?? payload.reference;

      if (!providerReference) {
        throw new Error('Notification de versement KPay sans identifiant.');
      }

      return {
        kind: 'payout',
        externalId: `${providerReference}:${status}`,
        providerReference,
        status: normalizePayoutStatus(payload.status),
        failureReason: failed
          ? describeFailure(payload.failureReason ?? payload.failureCode)
          : undefined,
      };
    }

    if (event.startsWith('refund.')) {
      // Décidé depuis le tableau de bord de KPay : consigné là-bas, pas traité
      // ici. Le passer en paiement corromprait l'état d'un encaissement abouti.
      throw new WebhookIgnoredError(`Notification de remboursement (${event})`);
    }

    if (event && !event.startsWith('payment.')) {
      throw new WebhookIgnoredError(`Notification de type ${event}`);
    }

    const providerReference = payload.paymentId ?? payload.reference;

    if (!providerReference) {
      throw new Error('Notification de paiement KPay sans identifiant.');
    }

    return {
      kind: 'payment',
      // L'identifiant ET le statut : le même événement rejoué produit la même
      // clé — c'est l'idempotence —, un changement d'état en produit une autre.
      externalId: `${providerReference}:${status}`,
      providerReference,
      status: normalizeWebhookPaymentStatus(payload.status),
      failureCode: failed ? (payload.failureCode ?? String(payload.status)) : undefined,
      failureReason: failed
        ? describeFailure(payload.failureReason ?? payload.failureCode)
        : undefined,
      providerFeeAmount: payload.feeAmount,
      amount: payload.amount,
      currency: payload.currency,
    };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    // `capabilities.refund` vaut `false` : le service de remboursement s'arrête
    // avant d'arriver ici et explique qu'il faut le faire à la main. Ce garde-fou
    // ne sert qu'au jour où quelqu'un basculerait la capacité sans lire l'API.
    throw new Error(
      "L'API de KPay n'expose pas de remboursement : il se fait depuis son tableau de bord.",
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Versement
  // ───────────────────────────────────────────────────────────────────────────

  override async payout(input: PayoutInput): Promise<PayoutResult> {
    const body = {
      amount: input.amount,
      provider: input.method.providerMethodCode,
      phoneNumber: toLocalDialFormat(input.accountNumber),
      // Notre référence de retrait est unique : rejouer l'appel après une
      // coupure ne crée pas un second versement.
      externalId: input.reference,
      description: `Nexa-Kabi · retrait ${input.reference}`,
      metadata: { accountHolderName: input.accountHolderName },
    };

    const response = await this.request<KpayTransaction>(
      'POST',
      '/api/v1/payments/withdraw',
      body,
    );

    if (!response.id) {
      return {
        providerReference: input.reference,
        status: 'FAILED',
        failureReason: describeFailure(response.failureReason ?? response.message),
      };
    }

    const status = normalizePayoutStatus(response.status);

    return {
      providerReference: response.id,
      // `PROCESSING` est l'issue NORMALE : KPay accuse réception et transfère
      // de façon asynchrone. Marquer payé sur un accusé de réception mentirait.
      status: status === 'PAID' ? 'PAID' : status,
      failureReason:
        status === 'FAILED'
          ? describeFailure(response.failureReason ?? response.message)
          : undefined,
    };
  }

  override async getPayoutStatus(providerReference: string): Promise<ProviderPayoutStatus> {
    const transaction = await this.request<KpayTransaction>(
      'GET',
      `/api/v1/payments/withdraw/${encodeURIComponent(providerReference)}`,
    );

    const status = normalizePayoutStatus(transaction.status);

    return {
      status,
      failureReason:
        status === 'FAILED'
          ? describeFailure(transaction.failureReason ?? transaction.message)
          : undefined,
      rawResponse: transaction,
    };
  }

  /**
   * État opérationnel de chaque opérateur, relevé chez KPay.
   *
   * `GET /api/v1/payments/availability` répond par pays, par opérateur et par
   * type d'opération — `DEPOSIT` pour ce que nous encaissons, `PAYOUT` pour ce
   * que nous versons. KPay met sa réponse en cache une minute ; l'interroger
   * plus souvent ne donnerait rien de neuf.
   *
   * `REMITTANCE` est ignoré : nous ne faisons pas de transfert d'argent entre
   * particuliers.
   */
  override async listAvailability(): Promise<ProviderAvailability[]> {
    const countries = await this.request<KpayAvailabilityCountry[]>(
      'GET',
      '/api/v1/payments/availability',
    );

    const result: ProviderAvailability[] = [];

    for (const country of Array.isArray(countries) ? countries : []) {
      // KPay parle en ISO alpha-3 (`BEN`), nous en alpha-2 (`BJ`). La
      // conversion se fait ICI : rien au-dessus ne connaît ses conventions.
      const countryCode = country.country ? toAlpha2(country.country) : null;
      if (!countryCode) continue;

      for (const provider of country.providers ?? []) {
        if (!provider.provider) continue;

        for (const operation of provider.operationTypes ?? []) {
          const mapped = toOperation(operation.operationType);
          const status = toAvailability(operation.status);

          if (!mapped || !status) continue;

          result.push({
            countryCode,
            providerMethodCode: provider.provider,
            operation: mapped,
            status,
          });
        }
      }
    }

    return result;
  }

  /** KPay nomme sa référence `paymentId` — `payoutId` pour un versement. */
  override extractProviderReference(rawBody: string): string | null {
    try {
      const payload = JSON.parse(rawBody) as KpayWebhookPayload;
      return payload.paymentId ?? payload.payoutId ?? payload.reference ?? null;
    } catch {
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Vérifie l'application et l'environnement associés aux clés.
   *
   * Sert au diagnostic : `GET /api/v1/payments/me` répond `TEST` ou
   * `PRODUCTION`, ce qui lève tout doute sur la clé réellement en service.
   */
  async describeAccount(): Promise<{ application: string; environment: string }> {
    const response = await this.request<{
      application?: { name?: string };
      environment?: string;
    }>('GET', '/api/v1/payments/me');

    return {
      application: response.application?.name ?? 'inconnue',
      environment: response.environment ?? 'inconnu',
    };
  }

  private assertSignature(rawBody: string, received: string | undefined): void {
    if (!received || !this.webhookSecret) {
      throw new WebhookSignatureError('Signature de webhook absente.');
    }

    const expected = createHmac('sha256', this.webhookSecret).update(rawBody, 'utf8').digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(received.trim().toLowerCase(), 'utf8');

    // La comparaison de longueur d'abord : `timingSafeEqual` lève sur deux
    // tampons de tailles différentes.
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new WebhookSignatureError();
    }
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-Key': this.apiKey,
          'X-Secret-Key': this.secretKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      const payload = text ? safeJson(text) : null;

      if (!response.ok) {
        const message = errorMessage(payload, text);

        // Un doublon d'`externalId` signifie qu'une demande porte DÉJÀ cet
        // identifiant chez KPay. Notre clé d'idempotence rend le cas presque
        // impossible ; s'il survient, le dire tel quel évite de chercher du
        // côté des clés.
        if (response.status === 409) {
          this.logger.warn(`KPay ${method} ${path} → 409 (identifiant déjà utilisé)`);
          throw new Error(
            `KPay connaît déjà une transaction portant cet identifiant : ${message}`,
          );
        }

        if (response.status === 401 || response.status === 403) {
          this.logger.warn(`KPay ${method} ${path} → ${response.status} (authentification)`);
          throw new Error(
            'KPay a refusé les clés (X-API-Key / X-Secret-Key). Vérifie la paire et son ' +
              `environnement : ${message}`,
          );
        }

        // Ni la clé, ni le corps : les journaux ne portent que la voie, le code
        // et le message renvoyé.
        this.logger.warn(`KPay ${method} ${path} → ${response.status} ${message}`);
        throw new Error(`KPay a répondu ${response.status} : ${message}`);
      }

      return payload as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Le numéro tel que KPay l'attend : indicatif du pays, puis le numéro, sans
 * `+` ni zéro initial. Nos numéros sont en E.164 (`+22961234567`), il suffit
 * donc de retirer le `+`.
 */
function toLocalDialFormat(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

function toAlpha2(alpha3: string): string | null {
  return ALPHA3_TO_ALPHA2[alpha3.toUpperCase()] ?? null;
}

/** `DEPOSIT` est ce que nous encaissons ; `REMITTANCE` ne nous concerne pas. */
function toOperation(operationType: string | undefined): 'COLLECTION' | 'PAYOUT' | null {
  switch (String(operationType).toUpperCase()) {
    case 'DEPOSIT':
      return 'COLLECTION';
    case 'PAYOUT':
      return 'PAYOUT';
    default:
      return null;
  }
}

function toAvailability(status: string | undefined): 'OPERATIONAL' | 'DELAYED' | 'CLOSED' | null {
  switch (String(status).toUpperCase()) {
    case 'OPERATIONAL':
      return 'OPERATIONAL';
    case 'DELAYED':
      return 'DELAYED';
    case 'CLOSED':
      return 'CLOSED';
    default:
      // Un statut que KPay ajouterait demain : ne rien conclure vaut mieux que
      // de fermer un moyen qui marche sur la foi d'un mot inconnu.
      return null;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

/** Toutes les erreurs de KPay portent un champ `message`. */
function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as KpayErrorBody).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }

  return fallback.slice(0, 200);
}

function normalizeStatus(status: string | undefined): PaymentStatus {
  switch (String(status).toUpperCase()) {
    case 'COMPLETED':
      return 'SUCCEEDED';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'PROCESSING':
      return 'PROCESSING';
    default:
      return 'PENDING';
  }
}

/** Un webhook ne connaît que quatre issues utiles ; le reste est « en cours ». */
function normalizeWebhookPaymentStatus(
  status: string,
): 'SUCCEEDED' | 'FAILED' | 'PROCESSING' | 'EXPIRED' {
  switch (normalizeStatus(status)) {
    case 'SUCCEEDED':
      return 'SUCCEEDED';
    case 'FAILED':
    case 'CANCELLED':
      return 'FAILED';
    default:
      return 'PROCESSING';
  }
}

function normalizePayoutStatus(status: string | undefined): 'PROCESSING' | 'PAID' | 'FAILED' {
  switch (String(status).toUpperCase()) {
    case 'COMPLETED':
      return 'PAID';
    case 'FAILED':
    case 'CANCELLED':
      return 'FAILED';
    default:
      return 'PROCESSING';
  }
}

/**
 * Toujours une phrase en français : l'écran d'échec interdit le code brut seul.
 *
 * Les codes de KPay sont explicites (`PAYER_LIMIT_REACHED`, `PAYER_NOT_FOUND`)
 * mais restent des codes ; ceux qui reviennent le plus sont traduits, les
 * autres accompagnent une phrase qui dit au moins quoi faire.
 */
function describeFailure(reason: string | undefined): string {
  if (!reason) return "L'opérateur a refusé le paiement. Vérifie ton solde et réessaie.";

  switch (reason.toUpperCase()) {
    case 'PAYER_LIMIT_REACHED':
      return 'Le plafond de ton compte Mobile Money est atteint. Réessaie plus tard ou change de moyen.';
    case 'PAYER_NOT_FOUND':
      return "Ce numéro n'a pas de compte Mobile Money chez cet opérateur. Vérifie le numéro.";
    case 'PAYMENT_NOT_APPROVED':
      return "La demande n'a pas été validée sur le téléphone. Réessaie et saisis ton code.";
    case 'INSUFFICIENT_FUNDS':
      return 'Le solde est insuffisant. Recharge ton compte et réessaie.';
    case 'RECIPIENT_NOT_FOUND':
      return "Ce numéro n'a pas de compte Mobile Money chez cet opérateur.";
    case 'UNSPECIFIED_FAILURE':
      return "L'opérateur a refusé le paiement sans préciser la cause. Réessaie dans quelques instants.";
    default:
      return `L'opérateur a refusé : ${reason}`;
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
