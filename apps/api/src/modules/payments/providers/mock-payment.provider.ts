import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentProviderCode } from '@nexakabi/contracts';
import type { Env } from '../../../config/env';
import {
  PaymentProvider,
  WebhookSignatureError,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
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
 * Opérateur simulé.
 *
 * Ce n'est pas un utilitaire de test : c'est un LIVRABLE de premier plan. La
 * contractualisation avec MTN et Moov prend des semaines et constitue le
 * principal risque de calendrier du projet. Avec ce fournisseur, l'intégralité
 * du produit — tunnel d'achat, émission des billets, grand livre, retraits,
 * contrôle à l'entrée — se construit et se vérifie sans attendre personne.
 *
 * Il simule tout ce qui rend un paiement Mobile Money difficile :
 * l'asynchronisme, les échecs, les délais, les webhooks tardifs, dupliqués ou
 * hors séquence. Et il répond EXACTEMENT dans les formes du contrat
 * `PaymentProvider` : le jour où l'opérateur réel prend sa place, aucun
 * service, aucun écran ne change.
 *
 * ── Les scénarios se choisissent par le numéro ──────────────────────────────
 * Le numéro du payeur (encaissement) ou du bénéficiaire (versement) pilote le
 * résultat, ce qui rend les tests reproductibles :
 *   · se termine par 00 → échec immédiat (« solde insuffisant » / « compte inactif »)
 *   · se termine par 11 → jamais de réponse : reste en attente jusqu'à expiration
 *   · se termine par 22 → succès immédiat, sans attente
 *   · sinon             → succès après un court délai, comme une validation USSD
 *
 * ── Pourquoi il n'a pas de mémoire ──────────────────────────────────────────
 * Une première version gardait ses transactions dans une `Map`. En
 * développement, `nest --watch` redémarre l'API à chaque fichier enregistré :
 * un paiement en attente devenait « inconnu de l'opérateur », donc échoué, dès
 * qu'on touchait au code. Le scénario et l'instant d'émission sont désormais
 * ENCODÉS dans la référence : n'importe quelle instance, à n'importe quel
 * moment, peut répondre — c'est aussi le comportement d'un vrai opérateur, qui
 * ne perd pas une transaction parce que notre serveur a redémarré.
 */
@Injectable()
export class MockPaymentProvider extends PaymentProvider {
  /**
   * Code sous lequel ce simulateur se présente.
   *
   * Il peut endosser l'identité d'un opérateur réel — `mtn_momo`, `moov_money`,
   * `celtiis_cash` — tant que le contrat correspondant n'est pas signé. C'est
   * ce qui permet de construire et de vérifier l'écran de choix du moyen de
   * paiement tel que le prototype le décrit, sans attendre personne.
   *
   * Le jour où MTN est branché, sa vraie implémentation prend simplement sa
   * place dans l'annuaire : aucun écran, aucun service métier ne bouge.
   */
  readonly code: PaymentProviderCode;

  readonly capabilities = {
    refund: true,
    partialRefund: true,
    payout: true,
    statusPolling: true,
  };

  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly secret: string;

  constructor(config: ConfigService<Env, true>, code: PaymentProviderCode = 'mock') {
    super();

    this.code = code;

    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        "Le fournisseur de paiement simulé est interdit en production : il n'encaisse rien.",
      );
    }

    this.secret = config.get('OTP_PEPPER', { infer: true });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Encaissement
  // ───────────────────────────────────────────────────────────────────────────

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const scenario = scenarioFor(input.payerPhone);
    const now = Date.now();
    const providerReference = encodeReference('MOCK', scenario, now);

    this.logger.warn(
      `[${this.code} · simulé] Paiement ${providerReference} · ${input.amount} ${input.currency} · scénario « ${scenario} »`,
    );

    if (scenario === 'immediate_failure') {
      return {
        providerReference,
        status: 'FAILED',
        expiresAt: new Date(now),
        failureCode: 'INSUFFICIENT_FUNDS',
        failureReason: 'Solde insuffisant sur le compte Mobile Money.',
        rawResponse: { scenario },
      };
    }

    return {
      providerReference,
      status: scenario === 'instant_success' ? 'PROCESSING' : 'PENDING',
      expiresAt: new Date(now + 3 * 60 * 1000),
      // Consigne de l'opérateur, sans reprendre la question posée par le titre
      // de l'encart qui l'affiche : la répétition affaiblit la consigne.
      instructions:
        'Compose *880# et choisis « Approuver la transaction ». ' +
        'Aucun montant ne sera débité tant que tu ne valides pas.',
      rawResponse: { scenario },
    };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    const decoded = decodeReference('MOCK', providerReference);

    if (!decoded) {
      return {
        status: 'FAILED',
        failureCode: 'UNKNOWN_REFERENCE',
        failureReason: "Cette transaction n'existe pas chez l'opérateur.",
      };
    }

    switch (decoded.scenario) {
      case 'immediate_failure':
        return {
          status: 'FAILED',
          failureCode: 'INSUFFICIENT_FUNDS',
          failureReason: 'Solde insuffisant sur le compte Mobile Money.',
        };
      case 'timeout':
        return {
          status: 'PENDING',
          failureCode: 'AWAITING_CUSTOMER',
          failureReason: 'En attente de la validation du client.',
        };
      case 'instant_success':
        return { status: 'SUCCEEDED' };
      case 'delayed_success':
        // Le succès différé imite le temps réel de validation USSD.
        return {
          status: Date.now() >= decoded.issuedAt + SETTLEMENT_DELAY_MS ? 'SUCCEEDED' : 'PENDING',
        };
    }
  }

  async parseWebhook(raw: RawWebhook): Promise<NormalizedWebhookEvent> {
    const signature = firstHeader(raw.headers['x-mock-signature']);

    // La signature est vérifiée AVANT toute lecture du corps : accepter un
    // webhook non authentifié reviendrait à laisser n'importe qui déclarer un
    // paiement réussi.
    this.assertSignature(raw.rawBody, signature);

    const payload = JSON.parse(raw.rawBody) as {
      eventId?: string;
      providerReference?: string;
      status?: string;
      failureCode?: string;
      failureReason?: string;
      providerFeeAmount?: number;
    };

    if (!payload.providerReference || !payload.status) {
      throw new Error('Charge utile de webhook incomplète.');
    }

    return {
      // À défaut d'identifiant d'événement, on en dérive un déterministe :
      // rejouer le même webhook doit produire la même clé d'idempotence.
      externalId: payload.eventId ?? `${payload.providerReference}:${payload.status}`,
      providerReference: payload.providerReference,
      status: normalizeStatus(payload.status),
      failureCode: payload.failureCode,
      failureReason: payload.failureReason,
      providerFeeAmount: payload.providerFeeAmount,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    this.logger.warn(`[mock] Remboursement de ${input.amount} sur ${input.providerReference}`);

    return {
      providerReference: `MOCKREF-${randomBytes(4).toString('hex').toUpperCase()}`,
      status: 'COMPLETED',
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Versement
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Verse les recettes à un organisateur — en simulation.
   *
   * Même contrat que FedaPay : l'opérateur accuse réception (`PROCESSING`) et
   * l'argent part ensuite. Le numéro du compte de retrait choisit le scénario,
   * comme le numéro du payeur pour un encaissement : un retrait vers un numéro
   * finissant par 22 arrive tout de suite, par 00 est refusé, par 11 reste en
   * cours — c'est ainsi qu'on vérifie l'écran des retraits dans tous ses états.
   */
  override async payout(input: PayoutInput): Promise<PayoutResult> {
    const scenario = scenarioFor(input.accountNumber);
    const providerReference = encodeReference('MOCKPAY', scenario, Date.now());

    this.logger.warn(
      `[${this.code} · simulé] Versement ${providerReference} · ${input.amount} ${input.currency} → ${input.accountHolderName} · scénario « ${scenario} »`,
    );

    if (scenario === 'immediate_failure') {
      return { providerReference, status: 'FAILED', failureReason: PAYOUT_FAILURE_REASON };
    }

    return { providerReference, status: scenario === 'instant_success' ? 'PAID' : 'PROCESSING' };
  }

  override async getPayoutStatus(providerReference: string): Promise<ProviderPayoutStatus> {
    const decoded = decodeReference('MOCKPAY', providerReference);

    if (!decoded) {
      return { status: 'FAILED', failureReason: "Ce versement n'existe pas chez l'opérateur." };
    }

    switch (decoded.scenario) {
      case 'immediate_failure':
        return { status: 'FAILED', failureReason: PAYOUT_FAILURE_REASON };
      case 'timeout':
        return { status: 'PROCESSING' };
      case 'instant_success':
        return { status: 'PAID' };
      case 'delayed_success':
        return {
          status: Date.now() >= decoded.issuedAt + SETTLEMENT_DELAY_MS ? 'PAID' : 'PROCESSING',
        };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  /** Signature d'un corps : ce qu'un webhook du simulateur doit porter pour être accepté. */
  sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('hex');
  }

  private assertSignature(body: string, signature: string | undefined): void {
    if (!signature) {
      throw new WebhookSignatureError('Signature absente.');
    }

    const expected = Buffer.from(this.sign(body), 'hex');
    const received = Buffer.from(signature, 'hex');

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new WebhookSignatureError();
    }
  }
}

/** Délai avant qu'un succès différé n'aboutisse : le temps d'une validation USSD. */
const SETTLEMENT_DELAY_MS = 4_000;

const PAYOUT_FAILURE_REASON = 'Le compte Mobile Money du bénéficiaire est inactif ou inexistant.';

type Scenario = 'immediate_failure' | 'timeout' | 'instant_success' | 'delayed_success';

/** Le numéro pilote le scénario : les tests restent reproductibles. */
function scenarioFor(number: string): Scenario {
  const tail = number.slice(-2);

  if (tail === '00') return 'immediate_failure';
  if (tail === '11') return 'timeout';
  if (tail === '22') return 'instant_success';
  return 'delayed_success';
}

/** Une lettre par scénario dans la référence, lisible dans les journaux. */
const SCENARIO_CODES: Record<Scenario, string> = {
  immediate_failure: 'F',
  timeout: 'T',
  instant_success: 'I',
  delayed_success: 'D',
};

const SCENARIO_BY_CODE = Object.fromEntries(
  Object.entries(SCENARIO_CODES).map(([scenario, code]) => [code, scenario as Scenario]),
) as Record<string, Scenario>;

/**
 * `MOCK-D1K2J3H4G-7A3F` : préfixe, scénario, instant d'émission en base 36,
 * puis quatre chiffres hexadécimaux pour l'unicité. Tout ce qu'il faut pour
 * répondre à `getStatus` sans rien avoir retenu.
 */
function encodeReference(prefix: string, scenario: Scenario, issuedAt: number): string {
  const stamp = issuedAt.toString(36).toUpperCase();
  const salt = randomBytes(2).toString('hex').toUpperCase();

  return `${prefix}-${SCENARIO_CODES[scenario]}${stamp}-${salt}`;
}

function decodeReference(
  prefix: string,
  reference: string,
): { scenario: Scenario; issuedAt: number } | null {
  const match = new RegExp(`^${prefix}-([FTID])([0-9A-Z]+)-[0-9A-F]{4}$`).exec(reference);
  const [, code, stamp] = match ?? [];
  if (!code || !stamp) return null;

  const scenario = SCENARIO_BY_CODE[code];
  const issuedAt = parseInt(stamp, 36);

  if (!scenario || Number.isNaN(issuedAt)) return null;

  return { scenario, issuedAt };
}

function normalizeStatus(status: string): NormalizedWebhookEvent['status'] {
  const known: Record<string, NormalizedWebhookEvent['status']> = {
    SUCCESS: 'SUCCEEDED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    FAILURE: 'FAILED',
    PROCESSING: 'PROCESSING',
    EXPIRED: 'EXPIRED',
  };

  const normalized = known[status.toUpperCase()];

  if (!normalized) {
    throw new Error(`Statut de webhook inconnu : ${status}`);
  }

  return normalized;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
