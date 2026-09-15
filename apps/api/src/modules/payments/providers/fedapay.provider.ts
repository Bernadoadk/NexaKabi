import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentProviderCode, PaymentStatus } from '@nexakabi/contracts';
import { toNationalDigits } from '@nexakabi/utils';
import type { Env } from '../../../config/env';
import {
  PaymentProvider,
  WebhookSignatureError,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type NormalizedWebhookEvent,
  type ProviderPaymentStatus,
  type RawWebhook,
  type PayoutInput,
  type PayoutResult,
  type ProviderPayoutStatus,
  type RefundInput,
  type RefundResult,
} from './payment-provider';

/**
 * FedaPay.
 *
 * ── Pourquoi FedaPay plutôt qu'une intégration opérateur directe ────────────
 * Contracter séparément avec MTN, Moov et Celtiis prend des mois et impose
 * trois intégrations, trois formats de webhook, trois calendriers de
 * réconciliation. FedaPay agrège les trois derrière une seule API, avec un
 * contrat unique — c'est le raccourci qui rend le lancement possible.
 *
 * Le prix de ce raccourci est une commission supplémentaire et une dépendance.
 * L'abstraction `PaymentProvider` la rend réversible : le jour où le volume
 * justifie une intégration directe, on ajoute `MtnMomoProvider` à côté sans
 * toucher ni au tunnel d'achat, ni au grand livre, ni aux écrans.
 *
 * ── Le flux, en trois appels ────────────────────────────────────────────────
 *   1. `POST /transactions`            → crée la transaction, renvoie son `id`
 *   2. `POST /transactions/{id}/token` → jeton de paiement à usage unique
 *   3. `POST /{mode}` avec ce jeton    → déclenche le push USSD sur le téléphone
 *
 * Les trois sont enchaînés dans `initiate`, parce qu'ils ne forment qu'un seul
 * fait du point de vue du produit : « demander l'argent ». Un échec au milieu
 * laisse une transaction FedaPay orpheline, sans conséquence — elle expire.
 *
 * Documentation : https://docs.fedapay.com/api-reference/transactions/create
 */

/** Statuts renvoyés par FedaPay, tels qu'observés sur les transactions. */
type FedaPayStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'canceled'
  | 'refunded'
  | 'transferred'
  | 'approved_partially_refunded'
  | 'transferred_partially_refunded';

interface FedaPayTransaction {
  id: number;
  reference?: string;
  status: FedaPayStatus;
  amount?: number;
  fees?: number;
  last_error_code?: string | null;
  mode?: string;
}

/**
 * Versement vers un organisateur.
 *
 * Les statuts sont ceux de l'API Payouts, DISTINCTS de ceux des transactions :
 * `sent` ici, `approved` là-bas. Les confondre ferait passer un versement parti
 * pour un versement échoué.
 */
interface FedaPayPayout {
  id: number;
  reference?: string;
  status: FedaPayPayoutStatus;
  amount?: number;
  last_error_code?: string | null;
}

type FedaPayPayoutStatus = 'pending' | 'started' | 'processing' | 'sent' | 'failed';

/**
 * Correspondance des moyens de paiement.
 *
 * Les identifiants ne sont pas devinables — `mtn_open` pour MTN, `sbin` pour
 * Celtiis — et ils viennent de la documentation FedaPay, pas d'une déduction.
 */
const FEDAPAY_MODES: Readonly<Partial<Record<PaymentProviderCode, string>>> = {
  mtn_momo: 'mtn_open',
  moov_money: 'moov',
  celtiis_cash: 'sbin',
};

/** Tolérance sur l'horodatage d'un webhook, en secondes. Défaut du SDK FedaPay. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Délai au-delà duquel une demande non validée est abandonnée.
 *
 * FedaPay ne l'impose pas ; c'est NOTRE délai, annoncé à l'acheteur sur l'écran
 * d'attente. Le tenir vaut mieux que de laisser un compte à rebours mentir.
 */
const REQUEST_TIMEOUT_MINUTES = 3;

@Injectable()
export class FedaPayProvider extends PaymentProvider {
  readonly code: PaymentProviderCode;

  readonly capabilities = {
    refund: true,
    partialRefund: true,
    payout: true,
    statusPolling: true,
  };

  private readonly logger = new Logger(FedaPayProvider.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly callbackUrl: string;

  constructor(config: ConfigService<Env, true>, code: PaymentProviderCode) {
    super();

    this.code = code;

    const sandbox = config.get('FEDAPAY_ENVIRONMENT', { infer: true }) !== 'live';

    // Le bac à sable et la production ont des hôtes DIFFÉRENTS, pas seulement
    // des clés différentes : viser le mauvais avec les bonnes clés échoue à
    // l'authentification, ce qui est le bon comportement.
    this.baseUrl = sandbox ? 'https://sandbox-api.fedapay.com/v1' : 'https://api.fedapay.com/v1';
    this.secretKey = config.get('FEDAPAY_SECRET_KEY', { infer: true });
    this.webhookSecret = config.get('FEDAPAY_WEBHOOK_SECRET', { infer: true });
    this.callbackUrl = `${config.get('PUBLIC_API_URL', { infer: true })}/webhooks/payments/${code}`;
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const mode = FEDAPAY_MODES[this.code];

    /* c8 ignore next 3 -- l'annuaire n'enregistre que les codes pris en charge */
    if (!mode) {
      throw new Error(`FedaPay ne prend pas en charge le moyen « ${this.code} ».`);
    }

    const transaction = await this.call<FedaPayTransaction>('POST', '/transactions', {
      description: input.description,
      amount: input.amount,
      currency: { iso: input.currency },
      callback_url: this.callbackUrl,
      // Retrouve notre commande depuis le tableau de bord FedaPay, sans avoir
      // à faire le rapprochement à la main lors d'un incident.
      custom_metadata: { orderReference: input.orderReference, paymentId: input.paymentId },
      customer: {
        firstname: input.description.slice(0, 60),
        phone_number: { number: toNationalDigits(input.payerPhone), country: 'bj' },
      },
    });

    const { token } = await this.call<{ token: string; url: string }>(
      'POST',
      `/transactions/${transaction.id}/token`,
      {},
    );

    // Déclenche le push USSD. L'acheteur reçoit la demande sur son téléphone
    // sans jamais quitter Nexa-Kabi — c'est ce que le prototype exige.
    await this.call('POST', `/${mode}`, { token });

    return {
      // L'identifiant numérique, pas la référence lisible : c'est lui que
      // portent les webhooks et les interrogations de statut.
      providerReference: String(transaction.id),
      status: 'PENDING',
      expiresAt: new Date(Date.now() + REQUEST_TIMEOUT_MINUTES * 60 * 1000),
      instructions:
        'Compose *880# si tu ne reçois rien, et choisis « Approuver la transaction ». ' +
        'Aucun montant ne sera débité tant que tu ne valides pas.',
      rawResponse: { transactionId: transaction.id, mode },
    };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    const transaction = await this.call<{ 'v1/transaction': FedaPayTransaction }>(
      'GET',
      `/transactions/${providerReference}`,
    );

    // FedaPay enveloppe ses réponses de lecture dans une clé versionnée.
    const data = transaction['v1/transaction'] ?? (transaction as unknown as FedaPayTransaction);

    return {
      status: toPaymentStatus(data.status),
      failureCode: data.last_error_code ?? undefined,
      failureReason: describeFailure(data.status, data.last_error_code),
      rawResponse: data,
    };
  }

  /**
   * Vérifie et normalise un webhook.
   *
   * ── Format de la signature ──────────────────────────────────────────────
   *   X-FEDAPAY-SIGNATURE: t=<horodatage>,s=<hmac_sha256(«ts.corps», secret)>
   *
   * L'horodatage entre dans le calcul : sans lui, un webhook capté pourrait
   * être rejoué indéfiniment avec sa signature d'origine. La tolérance de cinq
   * minutes borne cette fenêtre.
   */
  async parseWebhook(raw: RawWebhook): Promise<NormalizedWebhookEvent> {
    const header = firstHeader(raw.headers['x-fedapay-signature']);

    this.assertSignature(raw.rawBody, header);

    const payload = JSON.parse(raw.rawBody) as {
      id?: number | string;
      name?: string;
      entity?: FedaPayTransaction;
      data?: { object?: FedaPayTransaction };
    };

    const transaction = payload.entity ?? payload.data?.object;

    if (!transaction?.id || !transaction.status) {
      throw new Error('Charge utile de webhook FedaPay incomplète.');
    }

    return Promise.resolve({
      // L'identifiant d'événement porte l'idempotence. À défaut, on en dérive
      // un déterministe : rejouer le même webhook produit la même clé.
      externalId: String(payload.id ?? `${transaction.id}:${transaction.status}`),
      providerReference: String(transaction.id),
      status: toWebhookStatus(transaction.status),
      failureCode: transaction.last_error_code ?? undefined,
      failureReason: describeFailure(transaction.status, transaction.last_error_code),
      // Les frais réellement prélevés, quand FedaPay les communique. Ils
      // réduisent la part de l'organisateur, jamais le montant payé.
      providerFeeAmount: typeof transaction.fees === 'number' ? transaction.fees : undefined,
    });
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const result = await this.call<FedaPayTransaction>(
      'POST',
      `/transactions/${input.providerReference}/refund`,
      { amount: input.amount, reason: input.reason },
    );

    return {
      providerReference: String(result.id),
      status: result.status === 'refunded' ? 'COMPLETED' : 'PROCESSING',
    };
  }

  /**
   * Verse les recettes à un organisateur.
   *
   * ── Deux appels, et pourquoi FedaPay les sépare ──────────────────────────
   * `POST /payouts` CRÉE le versement, sans rien envoyer. `PUT /payouts/start`
   * le déclenche. La séparation permet de préparer un lot puis de le libérer
   * d'un coup — et, accessoirement, de créer un versement sans jamais l'envoyer
   * si quelque chose cloche entre les deux.
   *
   * Nous enchaînons les deux immédiatement : un retrait demandé par un
   * organisateur est unitaire, et le différer n'apporterait qu'un état de plus
   * à surveiller.
   *
   * ── Ce qui se passe si le second appel échoue ────────────────────────────
   * Le versement existe chez FedaPay à l'état `pending`, sans être parti.
   * L'erreur remonte, le retrait reste `PENDING` chez nous, et personne n'a été
   * débité. C'est le bon sens de l'échec : mieux vaut un versement à relancer
   * qu'un versement parti sans trace de notre côté.
   */
  override async payout(input: PayoutInput): Promise<PayoutResult> {
    const mode = FEDAPAY_MODES[this.code];

    /* c8 ignore next 3 -- l'annuaire n'enregistre que les codes pris en charge */
    if (!mode) {
      throw new Error(`FedaPay ne verse pas via « ${this.code} ».`);
    }

    const created = await this.call<FedaPayPayout>('POST', '/payouts', {
      amount: input.amount,
      currency: { iso: input.currency },
      mode,
      customer: {
        // FedaPay identifie le bénéficiaire par ce bloc. Le nom est découpé
        // parce que leur API l'exige ; le produit ne collecte qu'un seul champ,
        // conformément au prototype.
        ...splitName(input.accountHolderName),
        ...(input.email ? { email: input.email } : {}),
        phone_number: { number: input.accountNumber, country: 'bj' },
      },
    });

    await this.call<unknown>('PUT', '/payouts/start', {
      // `scheduled_at: "now"` déclenche l'envoi immédiat. Sans ce champ, le
      // versement resterait créé mais jamais parti — l'erreur la plus facile à
      // commettre avec cette API, et la plus difficile à diagnostiquer.
      payouts: [{ id: created.id, scheduled_at: 'now' }],
    });

    return {
      providerReference: String(created.id),
      status: mapPayoutStatus(created.status),
    };
  }

  /**
   * Où en est un versement.
   *
   * `GET /payouts/:id` renvoie l'objet à jour ; `sent` est le seul état
   * heureux. En cas d'échec, FedaPay porte un code d'erreur — rendu tel quel
   * quand il existe, parce qu'un « Insufficient balance » dit à l'équipe où
   * chercher, là où « échoué » ne dit rien.
   */
  override async getPayoutStatus(providerReference: string): Promise<ProviderPayoutStatus> {
    const payout = await this.call<{ 'v1/payout': FedaPayPayout } | FedaPayPayout>(
      'GET',
      `/payouts/${providerReference}`,
    );

    // FedaPay enveloppe parfois la ressource sous sa clé de version.
    const resource = 'v1/payout' in payout ? payout['v1/payout'] : payout;
    const status = mapPayoutStatus(resource.status);

    return {
      status,
      failureReason:
        status === 'FAILED'
          ? `L'opérateur a refusé le versement${resource.last_error_code ? ` (${resource.last_error_code})` : ''}.`
          : undefined,
      rawResponse: resource,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Appelle l'API FedaPay.
   *
   * Les erreurs remontent avec le message de FedaPay quand il existe : un
   * « Insufficient balance » est plus utile au diagnostic qu'un « 400 ».
   */
  private async call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Un opérateur qui ne répond pas ne doit pas bloquer une requête HTTP
      // entrante : mieux vaut échouer et laisser la réconciliation trancher.
      signal: AbortSignal.timeout(15_000),
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (payload as { message?: string } | null)?.message ?? `HTTP ${response.status}`;

      this.logger.error(`FedaPay ${method} ${path} → ${message}`);
      throw new Error(`FedaPay : ${message}`);
    }

    return payload as T;
  }

  private assertSignature(body: string, header: string | undefined): void {
    /**
     * Secret absent : on refuse, on ne calcule pas.
     *
     * `createHmac('sha256', '')` ne lève pas — Node accepte une clé vide et
     * produit une empreinte parfaitement calculable par n'importe qui. Un
     * webhook « paiement réussi » devenait alors forgeable, avec émission des
     * billets et écriture au grand livre à la clé.
     *
     * La validation d'environnement rend déjà ce secret obligatoire dès qu'une
     * clé FedaPay est renseignée. Ce contrôle-ci est la seconde ligne : il
     * tient même si quelqu'un instancie ce fournisseur autrement.
     */
    if (!this.webhookSecret) {
      throw new WebhookSignatureError('Secret de webhook non configuré.');
    }

    if (!header) {
      throw new WebhookSignatureError('Signature absente.');
    }

    const parsed = parseSignatureHeader(header);

    if (!parsed) {
      throw new WebhookSignatureError('En-tête de signature illisible.');
    }

    const age = Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp);

    if (age > SIGNATURE_TOLERANCE_SECONDS) {
      // Un webhook trop ancien est probablement un rejeu. Le refuser borne la
      // fenêtre pendant laquelle une capture réseau resterait exploitable.
      throw new WebhookSignatureError('Horodatage de webhook hors tolérance.');
    }

    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${parsed.timestamp}.${body}`)
      .digest('hex');

    const received = Buffer.from(parsed.signature, 'hex');
    const computed = Buffer.from(expected, 'hex');

    if (received.length !== computed.length || !timingSafeEqual(received, computed)) {
      throw new WebhookSignatureError();
    }
  }
}

/** `t=1730000000,s=abcdef…` */
function parseSignatureHeader(header: string): { timestamp: number; signature: string } | null {
  let timestamp = Number.NaN;
  let signature = '';

  for (const part of header.split(',')) {
    const [key, value] = part.split('=');

    if (key?.trim() === 't') timestamp = Number(value);
    if (key?.trim() === 's') signature = value?.trim() ?? '';
  }

  return Number.isFinite(timestamp) && signature ? { timestamp, signature } : null;
}

/**
 * Traduit un statut FedaPay vers le nôtre.
 *
 * `transferred` signifie que l'argent a été reversé au marchand : c'est un
 * succès du point de vue du participant, et le confondre avec autre chose
 * bloquerait sa commande alors qu'il a payé.
 */
function toPaymentStatus(status: FedaPayStatus): PaymentStatus {
  switch (status) {
    case 'approved':
    case 'transferred':
      return 'SUCCEEDED';
    case 'declined':
      return 'FAILED';
    case 'canceled':
      return 'CANCELLED';
    case 'refunded':
      return 'REFUNDED';
    case 'approved_partially_refunded':
    case 'transferred_partially_refunded':
      return 'PARTIALLY_REFUNDED';
    default:
      return 'PENDING';
  }
}

/** Statuts qu'un webhook peut porter, restreints à ce que la machine accepte. */
function toWebhookStatus(status: FedaPayStatus): NormalizedWebhookEvent['status'] {
  const mapped = toPaymentStatus(status);

  if (mapped === 'SUCCEEDED' || mapped === 'FAILED' || mapped === 'EXPIRED') return mapped;
  if (mapped === 'CANCELLED') return 'FAILED';

  return 'PROCESSING';
}

/**
 * Cause d'un échec, en français.
 *
 * Le prototype interdit d'afficher un code brut seul : « INSUFFICIENT_FUNDS »
 * ne dit rien à un acheteur, « Solde insuffisant » lui dit quoi faire.
 */
function describeFailure(status: FedaPayStatus, code?: string | null): string | undefined {
  if (status !== 'declined' && status !== 'canceled') return undefined;

  const known: Record<string, string> = {
    insufficient_funds: 'Solde insuffisant sur le compte Mobile Money.',
    invalid_pin: 'Le code secret saisi est incorrect.',
    transaction_timeout: 'La demande n’a pas été validée à temps sur ton téléphone.',
    customer_canceled: 'La demande a été refusée sur ton téléphone.',
    account_not_found: 'Ce numéro n’a pas de compte Mobile Money actif.',
    limit_exceeded: 'Le plafond de ton compte Mobile Money est atteint.',
  };

  return (
    (code ? known[code.toLowerCase()] : undefined) ??
    'Le paiement a été refusé par l’opérateur. Réessaie ou change de numéro.'
  );
}

/**
 * Traduit le statut d'un versement.
 *
 * `sent` est le seul état terminal heureux. `pending`, `started` et
 * `processing` décrivent tous « c'est en route » : les distinguer côté produit
 * n'apporterait rien à l'organisateur, qui veut savoir si l'argent est arrivé.
 */
function mapPayoutStatus(status: FedaPayPayoutStatus): PayoutResult['status'] {
  switch (status) {
    case 'sent':
      return 'PAID';
    case 'failed':
      return 'FAILED';
    default:
      return 'PROCESSING';
  }
}

/**
 * Découpe un nom pour l'API FedaPay.
 *
 * ── Un champ chez nous, deux chez eux ────────────────────────────────────
 * Le prototype refuse d'imposer prénom + nom séparés — « Kossi Adjovi » comme
 * « Adjovi Kossi Yao » sont des façons légitimes de se nommer au Bénin, et
 * demander de les ranger dans deux cases fait deviner à l'utilisateur ce qu'on
 * attend de lui. FedaPay, lui, exige les deux champs.
 *
 * La règle retenue : le PREMIER mot est le prénom, le reste est le nom. C'est
 * ce que fait déjà le reste du produit pour saluer quelqu'un par son prénom, et
 * l'inverse — dernier mot comme prénom — serait faux plus souvent ici.
 *
 * Le nom sert au rapprochement chez l'opérateur, qui compare la chaîne
 * complète : un découpage imparfait n'invalide pas le versement.
 */
function splitName(fullName: string): { firstname: string; lastname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return { firstname: 'Organisateur', lastname: 'Nexa-Kabi' };
  // Un seul mot : FedaPay refuse un champ vide, on répète plutôt que d'inventer.
  if (parts.length === 1) return { firstname: parts[0]!, lastname: parts[0]! };

  return { firstname: parts[0]!, lastname: parts.slice(1).join(' ') };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
