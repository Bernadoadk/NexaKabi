import { randomUUID, timingSafeEqual } from 'node:crypto';
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
  type MerchantMethod,
  type NormalizedWebhookEvent,
  type PayoutInput,
  type PayoutResult,
  type ProviderPaymentStatus,
  type ProviderPayoutStatus,
  type RawWebhook,
  type RefundInput,
  type RefundResult,
} from './payment-provider';

/**
 * Bictorys — prestataire de paiement principal.
 *
 * ── Pourquoi un agrégateur multi-pays ───────────────────────────────────────
 * Bictorys encaisse par carte et par Mobile Money — MTN, Moov, Orange Money,
 * Wave, Free Money, T-Money — dans plusieurs pays d'Afrique de l'Ouest, et
 * sait verser vers la plupart de ces moyens, derrière UNE API et UN compte
 * marchand. Ouvrir un pays consiste à configurer ses moyens, pas à négocier
 * un contrat de plus.
 *
 * ── Ce que ce fichier sait, et ce qu'il ignore ──────────────────────────────
 * Il sait parler à Bictorys : chemins, en-têtes, formats. Il IGNORE quel
 * moyen est ouvert dans quel pays — c'est la configuration `CountryPaymentMethod`
 * qui le lui dit à chaque appel, par `method.providerMethodCode`. Aucune
 * table d'opérateurs ici : elle vivrait en double, et divergerait.
 *
 * ── Les appels ──────────────────────────────────────────────────────────────
 *   Encaissement   POST /pay/v1/charges?payment_type=<psp>  (Mobile Money, direct)
 *                  POST /pay/v1/charges                      (carte : page hébergée)
 *   Statut         GET  /pay/v1/transactions/{id}
 *   Remboursement  PUT  /pay/v1/transactions/{id}/refund
 *   Versement      POST /pay/v1/payouts?payment_type=<psp>   avec `idempotency-key`
 *   Compte         GET  /onboarding/v1/payment-methods/me   (synchronisation)
 *
 * ── Le webhook n'est qu'un signal ───────────────────────────────────────────
 * Bictorys authentifie ses notifications par un secret partagé dans l'en-tête
 * `X-Secret-Key`, sans signature du corps. Un secret peut fuiter ; un corps
 * peut être rejoué modifié. `capabilities.verifyWebhookByFetch` demande donc
 * au service de RELIRE la transaction chez Bictorys avant de créditer quoi que
 * ce soit : la notification dit « regarde », la lecture dit « voilà ».
 *
 * Documentation : https://docs.bictorys.com
 */

/** Statuts renvoyés par l'API des transactions. */
type BictorysStatus =
  | 'initiated'
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'authorized'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'reversed';

interface BictorysTransaction {
  id: string;
  type?: 'payment' | 'transfer' | 'refund' | 'settlement';
  status: BictorysStatus | string;
  amount?: number;
  currency?: string;
  merchantFees?: number;
  customerFees?: number;
  pspName?: string;
  paymentReference?: string;
  merchantReference?: string;
  errorReason?: string;
  message?: string;
  timestamp?: string;
}

/** Réponse à la création d'une charge. */
interface BictorysChargeResponse {
  transactionId?: string;
  chargeId?: string;
  type?: string;
  link?: string;
  redirectUrl?: string;
  qrCode?: string;
  message?: string;
  merchantReference?: string;
  opToken?: string;
  state?: string;
  status?: string;
  errorReason?: string;
}

interface BictorysMerchantMethod {
  id?: string;
  name?: string;
  type?: string;
  category?: string;
  countries?: string;
  enabled?: boolean;
  transferEnabled?: boolean;
  phoneNumberRequired?: boolean;
  otpGenerationInstruction?: string;
}

/**
 * Délai au-delà duquel une demande Mobile Money non validée est abandonnée.
 *
 * Bictorys ne l'impose pas ; c'est NOTRE délai, annoncé à l'acheteur sur
 * l'écran d'attente. Le tenir vaut mieux que de laisser un compte à rebours
 * mentir.
 */
const MOBILE_REQUEST_TIMEOUT_MINUTES = 3;
/** Une page de paiement par carte laisse plus de temps : saisie, 3-D Secure. */
const CARD_REQUEST_TIMEOUT_MINUTES = 15;

const REQUEST_TIMEOUT_MS = 20_000;

@Injectable()
export class BictorysProvider extends PaymentProvider {
  readonly code: PaymentProviderCode = 'bictorys';

  readonly capabilities = {
    refund: true,
    partialRefund: false,
    payout: true,
    statusPolling: true,
    verifyWebhookByFetch: true,
  };

  private readonly logger = new Logger(BictorysProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly payoutSecretCode: string;

  constructor(config: ConfigService<Env, true>) {
    super();

    this.baseUrl =
      config.get('BICTORYS_ENVIRONMENT', { infer: true }) === 'live'
        ? 'https://api.bictorys.com'
        : 'https://api.test.bictorys.com';
    this.apiKey = config.get('BICTORYS_API_KEY', { infer: true });
    this.webhookSecret = config.get('BICTORYS_WEBHOOK_SECRET', { infer: true });
    this.payoutSecretCode = config.get('BICTORYS_PAYOUT_SECRET_CODE', { infer: true });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Encaissement
  // ───────────────────────────────────────────────────────────────────────────

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const isCard = input.method.kind === 'CARD';
    const timeoutMinutes = isCard ? CARD_REQUEST_TIMEOUT_MINUTES : MOBILE_REQUEST_TIMEOUT_MINUTES;
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

    // La carte passe par la page hébergée de Bictorys : la saisie du numéro
    // de carte chez nous exigerait une certification PCI-DSS. Sans
    // `payment_type`, Bictorys répond une page où le participant choisit et
    // saisit — et où nous ne voyons jamais la carte.
    const path = isCard
      ? '/pay/v1/charges'
      : `/pay/v1/charges?payment_type=${encodeURIComponent(input.method.providerMethodCode)}`;

    // Le pare-feu de Bictorys rejette en bloc (403, page HTML) toute requête
    // dont une adresse de retour pointe vers `localhost` — le cas d'un poste
    // de développement. Les adresses sont facultatives : on les omet plutôt
    // que de perdre le paiement. La carte, elle, ne ramène alors pas
    // l'acheteur toute seule : pour la tester en local, `PUBLIC_WEB_URL` doit
    // être une adresse publique (tunnel).
    const returnUrls = isPublicUrl(input.returnUrls.success) ? input.returnUrls : null;

    if (!returnUrls) {
      this.warnOnce(
        'PUBLIC_WEB_URL n’est pas une adresse publique : les adresses de retour ne sont pas ' +
          'transmises à Bictorys. Le Mobile Money fonctionne ; la carte ne ramènera pas ' +
          'l’acheteur sur le tunnel toute seule.',
      );
    }

    const body: Record<string, unknown> = {
      amount: input.amount,
      currency: input.currency,
      country: input.countryCode,
      paymentReference: input.orderReference,
      merchantReference: input.paymentId,
      ...(returnUrls
        ? { successRedirectUrl: returnUrls.success, errorRedirectUrl: returnUrls.error }
        : {}),
      customerObject: {
        name: input.customer.name,
        // Le numéro à DÉBITER pour le Mobile Money ; celui de l'acheteur sinon.
        phone: input.payerPhone ?? input.customer.phone,
        email: input.customer.email,
        country: input.countryCode,
        locale: 'fr-FR',
      },
      allowUpdateCustomer: true,
    };

    const response = await this.request<BictorysChargeResponse>('POST', path, body);

    const providerReference = response.transactionId ?? response.chargeId;

    if (!providerReference) {
      throw new Error(
        `Bictorys n'a pas renvoyé d'identifiant de transaction (${response.status ?? '?'})`,
      );
    }

    const declined =
      response.state === 'FAILED' || response.state === 'DECLINED' || response.status === 'failed';

    if (declined) {
      return {
        providerReference,
        status: 'FAILED',
        expiresAt,
        failureCode: 'DECLINED',
        failureReason: describeFailure(response.errorReason ?? response.message),
        rawResponse: response,
      };
    }

    return {
      providerReference,
      status: 'PENDING',
      expiresAt,
      // Page hébergée pour la carte ; lien de validation pour un Mobile Money
      // qui se valide dans une application plutôt que par USSD (Wave), ou dans
      // le simulateur du bac à sable.
      redirectUrl: isCard ? (response.link ?? response.redirectUrl) : undefined,
      confirmationUrl: isCard ? undefined : response.link,
      instructions: isCard ? undefined : (response.message ?? undefined),
      rawResponse: response,
    };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    const transaction = await this.request<BictorysTransaction>(
      'GET',
      `/pay/v1/transactions/${encodeURIComponent(providerReference)}`,
    );

    return {
      status: normalizePaymentStatus(transaction.status),
      failureCode: isFailure(transaction.status) ? transaction.status.toUpperCase() : undefined,
      failureReason: isFailure(transaction.status)
        ? describeFailure(transaction.errorReason ?? transaction.message)
        : undefined,
      providerFeeAmount: transaction.merchantFees,
      rawResponse: transaction,
    };
  }

  async parseWebhook(raw: RawWebhook): Promise<NormalizedWebhookEvent> {
    this.assertSecret(firstHeader(raw.headers['x-secret-key']));

    const payload = JSON.parse(raw.rawBody) as BictorysTransaction;

    if (!payload.id || !payload.status) {
      throw new Error('Notification Bictorys incomplète : identifiant ou statut absent.');
    }

    // Un identifiant de transaction et un statut : le même événement rejoué
    // produit la même clé, un changement d'état en produit une autre.
    const externalId = `${payload.id}:${String(payload.status).toLowerCase()}`;

    if (payload.type === 'transfer') {
      return {
        kind: 'payout',
        externalId,
        providerReference: payload.id,
        status: normalizePayoutStatus(payload.status),
        failureReason: isFailure(payload.status)
          ? describeFailure(payload.errorReason ?? payload.message)
          : undefined,
      };
    }

    if (payload.type && payload.type !== 'payment') {
      // Remboursements et règlements : consignés par ailleurs, pas ici.
      throw new WebhookIgnoredError(`Notification de type ${payload.type}`);
    }

    return {
      kind: 'payment',
      externalId,
      providerReference: payload.id,
      status: normalizeWebhookPaymentStatus(payload.status),
      failureCode: isFailure(payload.status) ? String(payload.status).toUpperCase() : undefined,
      failureReason: isFailure(payload.status)
        ? describeFailure(payload.errorReason ?? payload.message)
        : undefined,
      providerFeeAmount: payload.merchantFees,
      amount: payload.amount,
      currency: payload.currency,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // L'API ne prend pas de montant : le remboursement est intégral. C'est
    // pourquoi `partialRefund` est à `false` — annoncer une capacité que
    // l'API n'offre pas ferait échouer un remboursement partiel en silence.
    await this.request<unknown>(
      'PUT',
      `/pay/v1/transactions/${encodeURIComponent(input.providerReference)}/refund`,
    );

    return { providerReference: input.providerReference, status: 'PROCESSING' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Versement
  // ───────────────────────────────────────────────────────────────────────────

  override async payout(input: PayoutInput): Promise<PayoutResult> {
    const body: Record<string, unknown> = {
      amount: input.amount,
      currency: input.currency,
      country: input.countryCode,
      transactionType: 'transfer',
      merchantReference: input.reference,
      paymentReason: `Nexa-Kabi · retrait ${input.reference}`,
      customerObject: {
        name: input.accountHolderName,
        phone: input.accountNumber,
        email: input.email,
        country: input.countryCode,
        locale: 'fr-FR',
      },
      merchant: { secretCode: this.payoutSecretCode },
    };

    const response = await this.request<{ id?: string; status?: string; errorReason?: string }>(
      'POST',
      `/pay/v1/payouts?payment_type=${encodeURIComponent(input.method.providerMethodCode)}`,
      body,
      {
        // Notre référence de retrait est unique : rejouer l'appel après une
        // coupure ne crée pas un second versement chez Bictorys.
        'idempotency-key': toIdempotencyUuid(input.reference),
      },
    );

    if (!response.id) {
      return {
        providerReference: input.reference,
        status: 'FAILED',
        failureReason: describeFailure(response.errorReason),
      };
    }

    // Toujours « en cours » : c'est l'interrogation ou le webhook `transfer`
    // qui conclura. Marquer payé sur un accusé de réception mentirait.
    return { providerReference: response.id, status: 'PROCESSING' };
  }

  override async getPayoutStatus(providerReference: string): Promise<ProviderPayoutStatus> {
    const transaction = await this.request<BictorysTransaction>(
      'GET',
      `/pay/v1/transactions/${encodeURIComponent(providerReference)}`,
    );

    return {
      status: normalizePayoutStatus(transaction.status),
      failureReason: isFailure(transaction.status)
        ? describeFailure(transaction.errorReason ?? transaction.message)
        : undefined,
      rawResponse: transaction,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Synchronisation du compte marchand
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Ce que le compte marchand sait faire, pays par pays.
   *
   * `countries` arrive sous la forme `"SN,CI"` : un même moyen peut être
   * ouvert dans plusieurs pays, avec un seul drapeau pour tous. On le
   * déplie, et c'est la ligne de configuration de chaque pays qui en hérite.
   */
  override async listMerchantMethods(): Promise<MerchantMethod[]> {
    let methods: BictorysMerchantMethod[];

    try {
      methods = await this.request<BictorysMerchantMethod[]>(
        'GET',
        '/onboarding/v1/payment-methods/me',
      );
    } catch (error) {
      // Constaté en bac à sable : l'API d'onboarding répond « Invalid Token »
      // à une clé qui encaisse pourtant très bien. Le dire précisément, avec
      // ce qu'il reste à faire, plutôt qu'un 500 sans suite.
      const message = error instanceof Error ? error.message : String(error);
      if (/Invalid Token|Wrong Apikey|E401/i.test(message)) {
        throw new Error(
          "L'API d'onboarding de Bictorys n'accepte pas cette clé : la synchronisation n'est " +
            'pas disponible. Vérifie que la clé privée a la permission InfoRd (ou SettingsRd), ' +
            'ou configure les moyens à la main — la collecte, elle, fonctionne.',
        );
      }
      throw error;
    }

    const result: MerchantMethod[] = [];

    for (const method of Array.isArray(methods) ? methods : []) {
      const providerMethodCode = method.type ?? method.name;
      if (!providerMethodCode) continue;

      const countries = (method.countries ?? '')
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code));

      for (const countryCode of countries) {
        result.push({
          countryCode,
          providerMethodCode,
          collection: method.enabled === true,
          payout: method.transferEnabled === true,
        });
      }
    }

    return result;
  }

  /** Bictorys nomme sa référence `id`, à la racine de la notification. */
  override extractProviderReference(rawBody: string): string | null {
    try {
      const payload = JSON.parse(rawBody) as { id?: unknown };
      return typeof payload.id === 'string' ? payload.id : null;
    } catch {
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  private warned = new Set<string>();

  /** Un avertissement de configuration se lit une fois, pas à chaque paiement. */
  private warnOnce(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.logger.warn(message);
  }

  private assertSecret(received: string | undefined): void {
    if (!received || !this.webhookSecret) {
      throw new WebhookSignatureError('Secret de webhook absent.');
    }

    const expected = Buffer.from(this.webhookSecret, 'utf8');
    const given = Buffer.from(received, 'utf8');

    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new WebhookSignatureError();
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Api-Key': this.apiKey,
          'X-Amzn-Trace-Id': randomUUID(),
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      const payload = text ? safeJson(text) : null;

      if (!response.ok) {
        const details =
          payload && typeof payload === 'object' && 'details' in payload
            ? String((payload as { details: unknown }).details)
            : text.slice(0, 200);

        // Un 403 en HTML ne vient pas de l'API mais de son pare-feu, qui
        // rejette la requête avant même de la lire. Constaté : une adresse de
        // retour vers `localhost`. Documenté aussi : une clé restreinte à une
        // autre adresse IP. Le dire tel quel évite de chercher pendant une
        // heure du côté des permissions.
        if (response.status === 403 && !text.trimStart().startsWith('{')) {
          const hint =
            'Le pare-feu de Bictorys a rejeté la requête (403). Causes connues : une adresse ' +
            'de retour vers localhost (mets une adresse publique dans PUBLIC_WEB_URL), ou une ' +
            'clé restreinte à une autre adresse IP.';
          this.logger.warn(`Bictorys ${method} ${path} → 403 HTML. ${hint}`);
          throw new Error(hint);
        }

        this.logger.warn(`Bictorys ${method} ${path} → ${response.status} ${details}`);
        throw new Error(`Bictorys a répondu ${response.status} : ${details}`);
      }

      return payload as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Une adresse que le prestataire peut rappeler : ni locale, ni privée. */
function isPublicUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return !(
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function normalizePaymentStatus(status: string): PaymentStatus {
  switch (status.toLowerCase()) {
    case 'succeeded':
    case 'authorized':
      return 'SUCCEEDED';
    case 'failed':
      return 'FAILED';
    case 'cancelled':
      return 'CANCELLED';
    case 'expired':
      return 'EXPIRED';
    case 'reversed':
      return 'REFUNDED';
    case 'processing':
      return 'PROCESSING';
    default:
      return 'PENDING';
  }
}

/** Un webhook ne connaît que quatre issues utiles ; le reste est « en cours ». */
function normalizeWebhookPaymentStatus(
  status: string,
): 'SUCCEEDED' | 'FAILED' | 'PROCESSING' | 'EXPIRED' {
  switch (normalizePaymentStatus(status)) {
    case 'SUCCEEDED':
      return 'SUCCEEDED';
    case 'FAILED':
    case 'CANCELLED':
      return 'FAILED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return 'PROCESSING';
  }
}

function normalizePayoutStatus(status: string): 'PROCESSING' | 'PAID' | 'FAILED' {
  switch (status.toLowerCase()) {
    case 'succeeded':
      return 'PAID';
    case 'failed':
    case 'cancelled':
    case 'expired':
    case 'reversed':
      return 'FAILED';
    default:
      return 'PROCESSING';
  }
}

function isFailure(status: string): boolean {
  return ['failed', 'cancelled', 'expired', 'reversed'].includes(status.toLowerCase());
}

/** Toujours une phrase en français : l'écran d'échec interdit le code brut seul. */
function describeFailure(reason: string | undefined): string {
  if (!reason) return "L'opérateur a refusé le paiement. Vérifie ton solde et réessaie.";
  return `L'opérateur a refusé : ${reason}`;
}

/**
 * Bictorys attend une clé d'idempotence au format UUID. Notre référence
 * (`NKP-8F4C21`) n'en est pas un : elle est projetée de façon déterministe
 * dans l'espace des UUID v8 (« custom »), de sorte que la même référence
 * produit toujours la même clé.
 */
function toIdempotencyUuid(reference: string): string {
  const hex = Buffer.from(reference, 'utf8').toString('hex').padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
