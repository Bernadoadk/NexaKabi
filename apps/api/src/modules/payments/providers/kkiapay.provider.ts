import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CheckoutFlow,
  KkiapayWidget,
  PaymentProviderCode,
  PaymentStatus,
} from '@nexakabi/contracts';
import type { Env } from '../../../config/env';
import {
  PaymentProvider,
  ProviderTransactionNotFoundError,
  WebhookIgnoredError,
  WebhookSignatureError,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type NormalizedWebhookEvent,
  type ProviderPaymentStatus,
  type ProviderRefundStatus,
  type RawWebhook,
  type RefundInput,
  type RefundResult,
} from './payment-provider';

/**
 * Kkiapay — Mobile Money et carte bancaire, en francs CFA.
 *
 * ── Le paiement se fait dans SA fenêtre ─────────────────────────────────────
 * Kkiapay ne documente aucune API pour lancer un paiement depuis un serveur :
 * c'est son SDK JavaScript qui ouvre, dans la page, une fenêtre où l'acheteur
 * choisit son opérateur, saisit son numéro ou sa carte, et valide. `initiate()`
 * n'appelle donc rien : il prépare cette fenêtre — clé PUBLIQUE, montant, mode
 * bac à sable, et notre identifiant de paiement en `partnerId`, que Kkiapay
 * rattache à la transaction et nous rend ensuite.
 *
 * ── La fenêtre ne prouve rien ───────────────────────────────────────────────
 * Sa documentation l'exige, et le code de son SDK le confirme : il écoute les
 * messages de la page sans en vérifier l'origine. Un « succès » vu par le
 * navigateur peut donc être fabriqué par n'importe quel script. Ce n'est
 * qu'une piste — la référence d'une transaction — que le serveur va lire chez
 * Kkiapay :
 *   Vérification   POST /api/v1/transactions/status   { transactionId }
 * et seul ce qu'il y lit fait foi : statut, montant, et `partnerId` égal à
 * NOTRE paiement. Une transaction réussie mais rattachée à un autre paiement —
 * rejouée depuis une autre commande — n'émet rien.
 *
 * ── Le webhook ──────────────────────────────────────────────────────────────
 * Déclaré au tableau de bord (Développeurs → Clés API → Webhook), avec un
 * « secret hash » que Kkiapay renvoie dans l'en-tête `x-kkiapay-secret`.
 * Événements : `transaction.success` et `transaction.failed` ; cinq nouvelles
 * tentatives en quelques secondes, puis abandon. Le secret authentifie
 * l'émetteur ; la relecture chez Kkiapay (`verifyWebhookByFetch`) établit les
 * faits — la notification ne dit pas qui a payé les frais.
 *
 * ── Ce qu'il rembourse ──────────────────────────────────────────────────────
 *   Rembourser     POST /api/v1/transactions/revert   { transactionId }
 * Une transaction Mobile Money réussie, INTÉGRALEMENT : l'appel ne prend pas
 * de montant, et les frais de transaction ne sont pas rendus. La carte n'est
 * pas couverte par la documentation : elle se rembourse à la main.
 *
 * ── Ce qu'il ne fait pas ────────────────────────────────────────────────────
 * Aucun versement vers un tiers : les « reversements » de Kkiapay paient NOTRE
 * solde sur NOS comptes. Les retraits des organisateurs se font donc à la
 * main, depuis la console. Aucune API de solde, de disponibilité des
 * opérateurs ni de liste des transactions n'est documentée : ces méthodes
 * facultatives du contrat restent absentes plutôt qu'inventées.
 *
 * ── Les adresses ─────────────────────────────────────────────────────────────
 * Les pages de documentation ne donnent que les méthodes des SDK serveur ;
 * adresses et en-têtes viennent du code de ces SDK officiels
 * (github.com/kkiapay/nodejs-sdk, github.com/kkiapay/php-sdk).
 *
 * Documentation : https://docs.kkiapay.me/v1/
 */

const API_URLS = {
  sandbox: 'https://api-sandbox.kkiapay.me',
  live: 'https://api.kkiapay.me',
} as const;

const VERIFY_PATH = '/api/v1/transactions/status';
const REVERT_PATH = '/api/v1/transactions/revert';

/**
 * Pays que la fenêtre sait restreindre — attribut `countries` du SDK
 * JavaScript. Un pays absent de cette liste ne restreint rien : la fenêtre
 * s'ouvre alors sur ses propres réglages.
 */
const WIDGET_COUNTRIES: ReadonlySet<string> = new Set(['BJ', 'CI', 'TG', 'SN', 'NE']);

/** Couleur de marque Nexa-Kabi (`--color-coral`), pour habiller la fenêtre. */
const WIDGET_THEME = '#FF4D2E';

/**
 * Une vérification bloque l'acheteur qui attend sa confirmation : au-delà,
 * mieux vaut lui dire de patienter — la notification et la réconciliation
 * prendront le relais — que de le laisser devant un écran figé.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/** Réponse de `POST /api/v1/transactions/status`, telle que les SDK la documentent. */
interface KkiapayTransaction {
  transactionId?: string;
  status?: string;
  /** `DEBIT` pour un paiement reçu d'un client. */
  type?: string;
  /** `MOBILE_MONEY`, `CARD`, `WALLET`. */
  source?: string;
  /** L'opérateur, par exemple `mtn-benin`. */
  source_common_name?: string;
  amount?: number | string;
  fees?: number | string;
  /** Ce que Kkiapay nous crédite réellement. */
  income?: number | string;
  /** Qui supporte les frais : `customer` ou le marchand. */
  feeSupportedBy?: string;
  partnerId?: string | null;
  reason?: string;
  failureCode?: string;
  failureMessage?: string;
  performed_at?: string;
  client?: { fullname?: string; phone?: string; email?: string };
}

/** Corps d'une notification (tableau de bord → Webhook). */
interface KkiapayWebhookPayload {
  transactionId?: unknown;
  isPaymentSucces?: unknown;
  account?: unknown;
  failureCode?: unknown;
  failureMessage?: unknown;
  method?: unknown;
  amount?: unknown;
  fees?: unknown;
  partnerId?: unknown;
  performedAt?: unknown;
  event?: unknown;
}

/**
 * Statuts renvoyés par l'API — liste « complete possible status » du SDK
 * Node, complétée de `PENDING` et `REVERTED` que déclare le SDK PHP.
 */
const REFUSAL_STATUSES: ReadonlySet<string> = new Set([
  'FAILED',
  'INSUFFICIENT_FUND',
  'TRANSACTION_NOT_ELIGIBLE',
  'TRANSACTION_NOT_FOUND',
  'INVALID_TRANSACTION',
  'INVALID_TRANSACTION_TYPE',
]);

/** Réponse HTTP lue, erreur comprise : chez Kkiapay, un refus porte son statut dans le corps. */
interface KkiapayResponse {
  readonly httpStatus: number;
  readonly body: Record<string, unknown> | null;
}

@Injectable()
export class KkiapayProvider extends PaymentProvider {
  readonly code: PaymentProviderCode = 'kkiapay';

  readonly capabilities = {
    refund: true,
    /** L'appel de remboursement ne prend pas de montant : tout ou rien. */
    partialRefund: false,
    /** La documentation ne couvre que le Mobile Money. */
    refundMethodKinds: ['MOBILE_MONEY'] as const,
    /** Aucun délai documenté. */
    refundWindowDays: null,
    /** Les « reversements » ne paient que notre propre compte. */
    payout: false,
    statusPolling: true,
    /** Le secret authentifie l'émetteur ; la vérification établit les faits. */
    verifyWebhookByFetch: true,
  };

  private readonly logger = new Logger(KkiapayProvider.name);
  private readonly baseUrl: string;
  private readonly sandbox: boolean;
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly secretKey: string;
  private readonly webhookSecretDigest: Buffer;

  constructor(config: ConfigService<Env, true>) {
    super();

    this.sandbox = config.get('KKIAPAY_SANDBOX', { infer: true });
    this.baseUrl = this.sandbox ? API_URLS.sandbox : API_URLS.live;
    this.publicKey = config.get('KKIAPAY_PUBLIC_KEY', { infer: true });
    this.privateKey = config.get('KKIAPAY_PRIVATE_KEY', { infer: true });
    this.secretKey = config.get('KKIAPAY_SECRET_KEY', { infer: true });
    // Seule l'empreinte est gardée : la comparaison se fait sur deux
    // empreintes de même longueur, ce qui ne laisse rien fuir par le temps.
    this.webhookSecretDigest = digest(config.get('KKIAPAY_WEBHOOK_SECRET', { infer: true }));

    this.logger.log(`Kkiapay branché (${this.sandbox ? 'bac à sable' : 'PRODUCTION'})`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Encaissement
  // ───────────────────────────────────────────────────────────────────────────

  /** Tout se valide dans la fenêtre de Kkiapay, Mobile Money comme carte. */
  checkoutFlow(): CheckoutFlow {
    return 'widget';
  }

  /**
   * Prépare la fenêtre de paiement. Aucun appel à Kkiapay : la transaction
   * n'existera qu'au moment où l'acheteur validera dans la fenêtre.
   */
  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    return { status: 'PENDING', widget: this.widget(input) };
  }

  override widget(input: InitiatePaymentInput): KkiapayWidget {
    if (input.currency !== 'XOF') {
      // Le routage l'empêche déjà (`currencies` du prestataire) ; si cela
      // arrive malgré tout, le dire vaut mieux qu'ouvrir une fenêtre qui
      // encaisserait des francs CFA pour une commande dans une autre devise.
      throw new Error(
        `Kkiapay n'encaisse qu'en francs CFA (XOF) ; ${input.currency} lui a été demandé.`,
      );
    }

    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error(`Montant invalide pour Kkiapay : ${input.amount}.`);
    }

    const name = input.customer.name.trim();
    const email = input.customer.email?.trim();

    return {
      provider: 'kkiapay',
      key: this.publicKey,
      sandbox: this.sandbox,
      amount: input.amount,
      partnerId: input.paymentId,
      data: input.orderReference,
      paymentmethod: [widgetFamily(input.method.providerMethodCode, input.method.kind)],
      ...(WIDGET_COUNTRIES.has(input.countryCode) ? { countries: [input.countryCode] } : {}),
      ...(name ? { name: name.slice(0, 100) } : {}),
      ...(email ? { email } : {}),
      position: 'center',
      theme: WIDGET_THEME,
    };
  }

  /**
   * Lit une transaction chez Kkiapay.
   *
   * Un statut que l'API n'annonce pas dans ses listes n'est jamais conclu :
   * il reste « en attente », et la prochaine lecture tranchera.
   */
  async getStatus(transactionId: string): Promise<ProviderPaymentStatus> {
    const transaction = await this.verify(transactionId);
    const status = normalizeStatus(transaction.status);
    const failed = status === 'FAILED';

    return {
      status,
      failureCode: failed ? transaction.failureCode || String(transaction.status) : undefined,
      failureReason: failed
        ? String(transaction.status).toUpperCase() === 'REVERTED'
          ? 'Cette transaction a été remboursée par Kkiapay.'
          : describeFailure(
              transaction.failureCode,
              transaction.failureMessage ?? transaction.reason,
            )
        : undefined,
      providerFeeAmount: status === 'SUCCEEDED' ? feesBorneByUs(transaction) : undefined,
      amount: toAmount(transaction.amount),
      merchantReference: nonEmpty(transaction.partnerId),
      payerPhone: toE164(transaction.client?.phone),
      rawResponse: transaction,
    };
  }

  async parseWebhook(raw: RawWebhook): Promise<NormalizedWebhookEvent> {
    // L'authentification d'abord : rien du corps n'est lu avant.
    this.assertWebhookSecret(firstHeader(raw.headers['x-kkiapay-secret']));

    let payload: KkiapayWebhookPayload;

    try {
      payload = JSON.parse(raw.rawBody) as KkiapayWebhookPayload;
    } catch {
      throw new Error('Notification Kkiapay illisible : le corps n’est pas du JSON.');
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('Notification Kkiapay illisible.');
    }

    const event = typeof payload.event === 'string' ? payload.event : '';

    if (event !== 'transaction.success' && event !== 'transaction.failed') {
      throw new WebhookIgnoredError(`Événement Kkiapay ${event || 'sans nom'}`);
    }

    const transactionId = nonEmpty(payload.transactionId);

    if (!transactionId) {
      throw new Error('Notification Kkiapay sans transactionId.');
    }

    // Une transaction sans notre identifiant n'est pas née dans le tunnel —
    // un lien de paiement ou une transaction lancée depuis le tableau de bord
    // Kkiapay, sur le même compte. Elle ne concerne aucune commande.
    const partnerId = nonEmpty(payload.partnerId);

    if (!partnerId) {
      throw new WebhookIgnoredError(
        `Transaction ${transactionId} sans référence Nexa-Kabi : encaissée hors du tunnel d'achat`,
      );
    }

    const succeeded = event === 'transaction.success';

    return {
      kind: 'payment',
      // La transaction ET l'événement : la même notification rejouée produit
      // la même clé — c'est l'idempotence —, un autre événement une autre.
      externalId: `${transactionId}:${event}`,
      providerReference: transactionId,
      merchantReference: partnerId,
      status: succeeded ? 'SUCCEEDED' : 'FAILED',
      failureCode: succeeded ? undefined : (nonEmpty(payload.failureCode) ?? 'FAILED'),
      failureReason: succeeded
        ? undefined
        : describeFailure(nonEmpty(payload.failureCode), nonEmpty(payload.failureMessage)),
      // Le montant annoncé est rapproché de celui du paiement avant tout
      // crédit. La devise n'y figure pas : Kkiapay n'encaisse qu'en XOF.
      amount: toAmount(payload.amount),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Remboursement
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Rembourse une transaction, intégralement.
   *
   * Kkiapay n'accepte pas de clé d'idempotence, mais ne rembourse jamais deux
   * fois : une transaction déjà remboursée est « non éligible ». Ce refus-là
   * est donc relu — après une réponse perdue, il peut vouloir dire que le
   * premier appel a abouti.
   */
  async refund(input: RefundInput): Promise<RefundResult> {
    if (!input.providerReference) {
      return {
        status: 'FAILED',
        failureReason:
          'Ce paiement n’a pas de référence de transaction Kkiapay : il se rembourse à la main.',
      };
    }

    const response = await this.post(REVERT_PATH, { transactionId: input.providerReference });
    const status = String(response.body?.status ?? '').toUpperCase();
    const accepted = response.httpStatus >= 200 && response.httpStatus < 300;

    // La référence du remboursement EST celle de la transaction remboursée :
    // c'est elle que l'on relit pour savoir s'il a abouti.
    const providerReference = input.providerReference;

    if (accepted && (status === 'SUCCESS' || status === 'REVERTED')) {
      return { providerReference, status: 'COMPLETED', rawResponse: response.body };
    }

    if (status === 'TRANSACTION_NOT_ELIGIBLE') {
      const state = await this.getRefundStatus(providerReference).catch(() => null);

      if (state?.status === 'COMPLETED') {
        return { providerReference, status: 'COMPLETED', rawResponse: response.body };
      }
    }

    if (REFUSAL_STATUSES.has(status)) {
      return {
        providerReference,
        status: 'FAILED',
        failureReason: describeRefundRefusal(status),
        rawResponse: response.body,
      };
    }

    if (accepted) {
      // Accepté sans statut final : la relecture de la transaction dira
      // quand elle est remboursée.
      return { providerReference, status: 'PROCESSING', rawResponse: response.body };
    }

    if (isRefusal(response.httpStatus)) {
      return {
        providerReference,
        status: 'FAILED',
        failureReason: `Kkiapay a refusé le remboursement : ${messageOf(response)}`,
        rawResponse: response.body,
      };
    }

    // Panne, limite de débit : l'issue est inconnue. Le service garde la
    // demande en l'état et la relance sans risque.
    throw new Error(`Kkiapay a répondu ${response.httpStatus} : ${messageOf(response)}`);
  }

  /**
   * Où en est un remboursement : la transaction remboursée passe à
   * `REVERTED`. Tant qu'elle n'y est pas, rien n'est conclu — Kkiapay ne
   * publie aucune notification de remboursement.
   */
  override async getRefundStatus(transactionId: string): Promise<ProviderRefundStatus> {
    const transaction = await this.verify(transactionId);

    return {
      status: String(transaction.status).toUpperCase() === 'REVERTED' ? 'COMPLETED' : 'PROCESSING',
      rawResponse: transaction,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Notifications conservées
  // ───────────────────────────────────────────────────────────────────────────

  override extractProviderReference(rawBody: string): string | null {
    return readField(rawBody, 'transactionId');
  }

  override extractMerchantReference(rawBody: string): string | null {
    return readField(rawBody, 'partnerId');
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `POST /api/v1/transactions/status` — clé privée requise.
   *
   * @throws ProviderTransactionNotFoundError si Kkiapay ne connaît pas la
   * transaction, si elle n'appartient pas à ce compte, ou si ce n'est pas un
   * paiement reçu.
   */
  private async verify(transactionId: string): Promise<KkiapayTransaction> {
    const response = await this.post(VERIFY_PATH, { transactionId });
    const body = (response.body ?? {}) as KkiapayTransaction;
    const status = String(body.status ?? '').toUpperCase();

    if (status === 'TRANSACTION_NOT_FOUND' || status === 'INVALID_TRANSACTION') {
      throw new ProviderTransactionNotFoundError(
        status === 'INVALID_TRANSACTION'
          ? `La transaction ${transactionId} n'appartient pas à ce compte Kkiapay.`
          : `Kkiapay ne connaît pas la transaction ${transactionId}.`,
      );
    }

    if (response.httpStatus < 200 || response.httpStatus >= 300) {
      if (isRefusal(response.httpStatus)) {
        throw new ProviderTransactionNotFoundError(
          `Kkiapay ne reconnaît pas la transaction ${transactionId} : ${messageOf(response)}`,
        );
      }

      throw new Error(`Kkiapay a répondu ${response.httpStatus} : ${messageOf(response)}`);
    }

    // Un paiement reçu est un DÉBIT du client. Une autre nature de
    // transaction (un remboursement, un reversement) ne règle aucune commande.
    if (body.type && String(body.type).toUpperCase() !== 'DEBIT') {
      throw new ProviderTransactionNotFoundError(
        `La transaction ${transactionId} n'est pas un paiement (${body.type}).`,
      );
    }

    return body;
  }

  private async post(path: string, body: unknown): Promise<KkiapayResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': this.publicKey,
          'x-private-key': this.privateKey,
          'x-secret-key': this.secretKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = text ? safeJson(text) : null;

      if (response.status === 401 || response.status === 403) {
        // Jamais les clés dans le journal : la voie et le code suffisent.
        this.logger.warn(`Kkiapay POST ${path} → ${response.status} (authentification)`);
        throw new Error(
          `Kkiapay a refusé les clés (${response.status}). Vérifie KKIAPAY_PUBLIC_KEY, ` +
            'KKIAPAY_PRIVATE_KEY et KKIAPAY_SECRET_KEY, et qu’elles correspondent à ' +
            `l’environnement choisi (${this.sandbox ? 'bac à sable' : 'production'}).`,
        );
      }

      if (!response.ok) {
        this.logger.warn(`Kkiapay POST ${path} → ${response.status}`);
      }

      return { httpStatus: response.status, body: parsed };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Kkiapay n'a pas répondu en ${REQUEST_TIMEOUT_MS / 1000} s.`);
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private assertWebhookSecret(received: string | undefined): void {
    if (!received) {
      throw new WebhookSignatureError('En-tête x-kkiapay-secret absent.');
    }

    // Deux empreintes SHA-256 : même longueur quoi qu'on reçoive, donc une
    // comparaison à temps constant qui ne trahit même pas la longueur du secret.
    if (!timingSafeEqual(digest(received.trim()), this.webhookSecretDigest)) {
      throw new WebhookSignatureError();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Famille de paiement de la fenêtre. Le code de moyen la porte déjà
 * (`momo`, `card`) ; la nature du moyen tranche s'il manque.
 */
function widgetFamily(providerMethodCode: string, kind: string): 'momo' | 'card' {
  if (providerMethodCode === 'momo' || providerMethodCode === 'card') return providerMethodCode;
  if (kind === 'CARD') return 'card';
  if (kind === 'MOBILE_MONEY') return 'momo';

  throw new Error(`Kkiapay ne sait pas encaisser un moyen de nature ${kind}.`);
}

/**
 * Statut Kkiapay → statut Nexa-Kabi. `REVERTED` — réussie puis remboursée —
 * compte comme un échec pour le paiement qui l'attendait : l'argent est
 * reparti, il n'est pas encaissé. Tout statut inconnu reste « en attente ».
 */
function normalizeStatus(status: string | undefined): PaymentStatus {
  switch (String(status).toUpperCase()) {
    case 'SUCCESS':
      return 'SUCCEEDED';
    case 'FAILED':
    case 'INSUFFICIENT_FUND':
    case 'REVERTED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

/**
 * Frais que Kkiapay retient SUR NOUS.
 *
 * `income` est ce qu'il nous crédite : l'écart avec le montant de la
 * transaction est exactement sa retenue. À défaut, qui supporte les frais :
 * payés par le client, ils s'ajoutent à son prix et ne nous coûtent rien.
 * Rien de tout cela : inconnu — rien n'est inventé.
 */
function feesBorneByUs(transaction: KkiapayTransaction): number | undefined {
  const amount = toAmount(transaction.amount);
  const income = toAmount(transaction.income);

  if (amount !== undefined && income !== undefined && income <= amount) {
    return amount - income;
  }

  const bearer = String(transaction.feeSupportedBy ?? '').toLowerCase();
  const fees = toAmount(transaction.fees);

  if (bearer === 'customer') return 0;
  if (bearer === 'merchant' && fees !== undefined) return fees;

  return undefined;
}

function toAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** `22997000000` → `+22997000000`. Tout autre format est ignoré. */
function toE164(phone: string | undefined): string | undefined {
  const digits = phone?.replace(/\D/g, '') ?? '';
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

function readField(rawBody: string, field: string): string | null {
  const parsed = safeJson(rawBody);
  return nonEmpty(parsed?.[field]) ?? null;
}

/** Un 4xx — hors authentification et limite de débit — est un refus : rien n'a été fait. */
function isRefusal(httpStatus: number): boolean {
  return httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429;
}

function messageOf(response: KkiapayResponse): string {
  const body = response.body ?? {};

  for (const key of ['message', 'reason', 'status', 'error', 'raw']) {
    const value = body[key];
    if (typeof value === 'string' && value.length > 0) return value.slice(0, 200);
  }

  return `réponse ${response.httpStatus}`;
}

/**
 * Toujours une phrase en français : l'écran d'échec interdit le code brut
 * seul. Les codes sont ceux de la documentation (notifications, bac à sable) ;
 * un code inconnu accompagne une phrase qui dit au moins quoi faire.
 */
function describeFailure(code: string | undefined, message: string | undefined): string {
  switch ((code ?? message ?? '').toLowerCase()) {
    case 'insufficient_fund':
    case 'insufficient_funds':
      return 'Le solde est insuffisant. Recharge ton compte et réessaie.';
    case 'processing_error':
      return "L'opérateur n'a pas pu traiter le paiement. Réessaie dans quelques instants.";
    case 'payment_declined':
      return 'Le paiement a été refusé. Vérifie ton code et réessaie, ou change de moyen.';
    case 'card_declined':
    case 'transaction_error':
      return 'La carte a été refusée par la banque. Essaie une autre carte ou un autre moyen.';
    case 'card_fraudulent':
      return 'La banque a bloqué ce paiement par carte. Contacte ta banque ou change de moyen.';
    case 'invalid_number':
      return "Ce numéro n'est pas un compte Mobile Money valide. Vérifie le numéro.";
    default:
      return code || message
        ? `Le paiement n'a pas abouti (${code ?? message}). Réessaie ou change de moyen.`
        : "Le paiement n'a pas abouti. Réessaie ou change de moyen.";
  }
}

/** Un refus de remboursement, dit à l'administrateur qui devra le reprendre. */
function describeRefundRefusal(status: string): string {
  switch (status) {
    case 'INSUFFICIENT_FUND':
      return 'Solde Kkiapay insuffisant pour rembourser : attends de nouveaux encaissements, puis relance.';
    case 'TRANSACTION_NOT_ELIGIBLE':
      return 'Kkiapay juge cette transaction non remboursable (déjà remboursée, ou hors conditions) : vérifie dans son tableau de bord.';
    case 'INVALID_TRANSACTION_TYPE':
      return 'Kkiapay ne rembourse pas ce type de transaction : ce remboursement se fait à la main.';
    case 'TRANSACTION_NOT_FOUND':
    case 'INVALID_TRANSACTION':
      return 'Kkiapay ne retrouve pas cette transaction sur ce compte : ce remboursement se fait à la main.';
    default:
      return 'Kkiapay a refusé le remboursement : ce remboursement se fait à la main.';
  }
}
