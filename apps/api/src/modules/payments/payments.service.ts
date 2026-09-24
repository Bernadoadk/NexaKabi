import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  RESERVATION_TTL_MINUTES,
  canTransitionPayment,
  getPaymentMethodDefinition,
  getPaymentProviderDefinition,
  isPaymentPending,
  paymentMethodRequiresPhone,
  resolveProviderMethodCode,
  type AttachPaymentTransactionResult,
  type CheckoutFlow,
  type CheckoutPaymentMethods,
  type InitiatePaymentInput,
  type PaymentMethodCode,
  type PaymentState,
  type PaymentStatus,
  type PaymentProviderCode,
  type PaymentWidget,
} from '@nexakabi/contracts';
import { maskPhone, tryNormalizePhoneForCountry } from '@nexakabi/utils';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { CountriesService } from '../countries/countries.service';
import { OrdersService } from '../orders/orders.service';
import { Prisma } from '../../generated/prisma/client';
import { PaymentRoutingService } from './payment-routing.service';
import { PaymentProviderRegistry } from './provider.registry';
import {
  ProviderTransactionNotFoundError,
  type InitiatePaymentInput as ProviderInitiateInput,
  type NormalizedPaymentWebhook,
  type PaymentProvider,
  type ProviderPaymentStatus,
} from './providers/payment-provider';

/** Origine d'un changement d'état, conservée pour le diagnostic. */
export type OutcomeSource = 'initiate' | 'checkout' | 'webhook' | 'poll' | 'expiry' | 'admin';

export interface PaymentOutcome {
  readonly status: PaymentStatus;
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly providerFeeAmount?: number;
  /**
   * Transaction qui a réglé le paiement, à lui rattacher — quand elle n'était
   * pas connue à l'initiation (fenêtre de paiement du prestataire).
   */
  readonly providerReference?: string;
  /** Numéro débité, quand il n'était pas connu à l'initiation. */
  readonly payerPhone?: string;
  readonly source: OutcomeSource;
  readonly rawPayload?: unknown;
}

export type OutcomeResult = 'applied' | 'ignored' | 'unchanged';

/** Ce que devient la COMMANDE quand son paiement réussit. */
type Settlement = 'paid' | 'unfulfillable';

/**
 * Verdict sur une transaction de fenêtre de paiement : en plus des issues
 * ordinaires, `rejected` — la transaction n'appartient pas à ce paiement.
 */
type WidgetVerdict = OutcomeResult | 'rejected';

/** Un paiement qui a encaissé — remboursé depuis ou non. */
const SETTLED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'SUCCEEDED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];

/** Une commande déjà réglée — remboursée depuis ou non. */
const SETTLED_ORDER_STATUSES: readonly string[] = [
  'PAID',
  'COMPLETED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];

/**
 * Écart minimal entre deux lectures chez le prestataire commandées par
 * l'écran d'attente, qui interroge toutes les trois secondes. La
 * notification arrive d'ordinaire bien avant ; inutile de lire plus souvent.
 */
const PAGE_POLL_MIN_INTERVAL_MS = 6_000;

/**
 * Vérifications qu'une page peut demander pour un même paiement, par minute.
 * Chacune coûte un appel au prestataire : sans plafond, une boucle sur une
 * référence inventée ferait de notre compte marchand un générateur de trafic.
 */
const CHECKOUT_VERIFICATIONS_PER_MINUTE = 10;

/** Un paiement avec ce qu'il faut de sa commande pour reconstruire une fenêtre. */
const paymentWithOrder = Prisma.validator<Prisma.PaymentDefaultArgs>()({
  include: {
    order: {
      select: {
        reference: true,
        buyerName: true,
        buyerPhone: true,
        buyerEmail: true,
        expiresAt: true,
        event: { select: { title: true } },
      },
    },
  },
});

type PaymentWithOrder = Prisma.PaymentGetPayload<typeof paymentWithOrder>;

/** Ce qu'il faut d'un paiement pour juger une transaction de sa fenêtre. */
interface WidgetPayment {
  readonly id: string;
  readonly amount: number;
  readonly status: PaymentStatus;
  readonly providerReference: string | null;
}

/**
 * Paiements.
 *
 * La partie la plus risquée du produit. Trois faits gouvernent sa conception :
 *
 *  1. **Le paiement est asynchrone.** L'acheteur valide sur son téléphone ou
 *     dans la fenêtre du prestataire. Le navigateur ne sait rien de sûr ; seul
 *     le prestataire sait. Aucun délai côté client ne doit donc conclure à
 *     l'échec, et aucun « succès » côté client ne vaut preuve.
 *  2. **Les prestataires rejouent leurs webhooks**, parfois dans le désordre.
 *     L'idempotence n'est pas une précaution, c'est une condition de
 *     fonctionnement.
 *  3. **Un webhook se perd.** La réconciliation par interrogation n'est pas un
 *     filet de secours facultatif : sans elle, un client payé reste sans billet.
 *
 * ── Ce que ce service ne sait pas ───────────────────────────────────────────
 * Quel prestataire traite quel moyen dans quel pays. Il le demande au routage
 * à chaque fois, et enregistre la réponse sur le paiement — `providerCode`
 * pour retrouver l'implémentation, `methodCode` pour le dire au participant.
 * Il ne sait pas non plus COMMENT l'acheteur valide : il le demande au
 * prestataire (`checkoutFlow`), et s'y règle.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly routing: PaymentRoutingService,
    private readonly countries: CountriesService,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl =
      config.get('PUBLIC_WEB_URL', { infer: true }) ??
      config.get('CORS_ORIGINS', { infer: true })[0] ??
      'http://localhost:3000';
  }

  /**
   * Moyens de paiement à proposer pour une commande.
   *
   * Générés depuis la configuration du PAYS de la commande : à Cotonou MTN
   * d'abord, à Dakar Wave d'abord — et jamais un moyen que le prestataire ne
   * sait pas traiter.
   */
  async listMethods(reference: string): Promise<CheckoutPaymentMethods> {
    const order = await this.orders.requireOrder(reference);
    return this.routing.listCollectionMethods(order.countryCode);
  }

  /**
   * Déclenche une demande de paiement.
   *
   * Idempotent sur le double-clic : tant qu'une demande est en cours pour cette
   * commande, la même est renvoyée. Sans cela, deux appels prestataire
   * partiraient et l'acheteur pourrait être débité deux fois.
   */
  async initiate(reference: string, input: InitiatePaymentInput): Promise<PaymentState> {
    const order = await this.orders.requireOrder(reference);

    if (order.status === 'PAID' || order.status === 'COMPLETED') {
      const settled = await this.prisma.payment.findFirst({
        where: { orderId: order.id, status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
      });

      if (settled) return this.toState(settled, reference);
      throw new ConflictException('Cette commande est déjà payée.');
    }

    if (order.status !== 'AWAITING_PAYMENT') {
      throw new ConflictException(
        order.status === 'DRAFT'
          ? 'Renseigne tes coordonnées avant de payer.'
          : 'Cette commande a expiré. Recommence ta sélection de billets.',
      );
    }

    if (order.expiresAt !== null && order.expiresAt.getTime() < Date.now()) {
      throw new ConflictException(
        'Le délai de réservation est écoulé. Recommence ta sélection de billets.',
      );
    }

    // Le routage tranche AVANT toute écriture : un moyen fermé, un pays non
    // ouvert ou un prestataire absent se voient au clic, pas trois appels plus loin.
    const route = await this.routing.resolveCollection(order.countryCode, input.method);
    const country = await this.countries.requireActive(order.countryCode);
    const flow = route.provider.checkoutFlow(route.method.kind);

    // Le numéro ne se demande chez nous que si c'est NOUS qui envoyons la
    // demande à son téléphone. Dans la fenêtre du prestataire, c'est elle qui
    // le demande — et c'est le seul numéro qui compte.
    const asksPhone = flow === 'push' && paymentMethodRequiresPhone(route.method.kind);

    // Le numéro appartient au pays de paiement, pas à celui de l'identifiant
    // de connexion : un payeur sénégalais donne un numéro en +221.
    const payerPhone = asksPhone
      ? this.countries.normalizePhone(input.payerPhone ?? '', country)
      : null;

    if (asksPhone && !payerPhone) {
      throw new BadRequestException('Indique le numéro Mobile Money à débiter.');
    }

    const inFlight = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (inFlight) {
      const sameProvider = inFlight.providerCode === route.provider.code;

      /**
       * ── Une fenêtre de paiement : on garde LE MÊME paiement ────────────────
       * Son identifiant est la référence que la fenêtre porte chez le
       * prestataire. Une tentative ratée, un changement de moyen, une fenêtre
       * refermée : l'acheteur recommence SUR CE PAIEMENT. En créer un autre
       * ferait abandonner le premier — et si l'acheteur avait en fait validé
       * dessus, son argent arriverait sur un paiement clos.
       */
      if (sameProvider && flow === 'widget' && this.flowOf(inFlight) === 'widget') {
        const reopened = await this.prisma.payment.update({
          where: { id: inFlight.id },
          data: { methodCode: route.method.code, failureCode: null, failureReason: null },
          ...paymentWithOrder,
        });

        return this.toState(reopened, reference, { widget: this.widgetFor(reopened) });
      }

      // Une demande identique en cours : on renvoie la même, sans rappeler
      // le prestataire. Une demande sur un AUTRE numéro ou moyen suppose que
      // la première a échoué côté client — elle est abandonnée explicitement.
      if (
        sameProvider &&
        inFlight.methodCode === input.method &&
        inFlight.payerPhone === payerPhone
      ) {
        return this.toState(inFlight, reference);
      }

      await this.applyOutcome(inFlight.id, {
        status: 'CANCELLED',
        failureReason: "Remplacée par une nouvelle demande de l'acheteur.",
        source: 'initiate',
      });
    }

    const { provider } = route;

    /**
     * Rang de la tentative, compté sur les demandes DÉJÀ TERMINÉES.
     *
     * Compter toutes les demandes donnerait un rang qui bouge dès qu'une
     * demande est créée : dix appels simultanés obtiendraient des rangs
     * différents et créeraient plusieurs paiements. Compté sur les seules
     * demandes terminées, le rang reste stable tant qu'aucune n'a abouti — ce
     * qui est exactement la fenêtre du double-clic — et n'avance qu'au moment
     * d'un vrai réessai, après un échec.
     */
    const retryGeneration = await this.prisma.payment.count({
      where: {
        orderId: order.id,
        status: { notIn: ['INITIATED', 'PENDING', 'PROCESSING'] },
      },
    });

    const idempotencyKey = `${order.id}:${retryGeneration}`;

    let payment;

    try {
      payment = await this.prisma.payment.create({
        data: {
          orderId: order.id,
          providerCode: provider.code,
          methodCode: route.method.code,
          countryCode: route.countryCode,
          // Clé déterministe : deux appels simultanés calculent le même rang et
          // se heurtent à l'index unique. C'est voulu — l'un crée le paiement,
          // l'autre est renvoyé vers celui-là.
          idempotencyKey,
          amount: order.totalAmount,
          currency: order.currency,
          payerPhone,
          status: 'INITIATED',
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // Double-clic, ou deux onglets. Le contrôle de demande en cours plus haut
      // ne suffit pas : deux appels vraiment simultanés le franchissent tous
      // les deux. C'est l'index unique qui tranche, et le perdant repart avec
      // la demande du gagnant plutôt qu'avec une erreur.
      const winner = await this.prisma.payment.findUnique({
        where: { idempotencyKey },
        ...paymentWithOrder,
      });

      if (!winner) throw error;

      this.logger.log(
        `Demande de paiement concurrente sur ${order.reference} — reprise du gagnant`,
      );
      return this.toState(winner, reference, { widget: this.widgetFor(winner) });
    }

    const startedAt = Date.now();

    try {
      const result = await provider.initiate({
        paymentId: payment.id,
        orderReference: order.reference,
        amount: order.totalAmount,
        currency: order.currency,
        countryCode: route.countryCode,
        method: route.method,
        payerPhone: payerPhone ?? undefined,
        customer: {
          name: order.buyerName,
          phone: order.buyerPhone,
          email: order.buyerEmail ?? undefined,
        },
        description: `Nexa-Kabi · ${order.event.title}`,
        returnUrls: this.returnUrls(order.reference, payment.id),
      });

      await this.prisma.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          kind: 'INITIATE',
          requestPayload: {
            provider: provider.code,
            method: route.method.code,
            country: route.countryCode,
            amount: order.totalAmount,
            flow,
          },
          responsePayload: toJson(result.rawResponse),
          durationMs: Date.now() - startedAt,
        },
      });

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerReference: result.providerReference ?? null,
          status: result.status,
          // Sans échéance du prestataire, le paiement vit aussi longtemps que
          // la réservation : l'acheteur qui valide dans la fenêtre à la
          // vingt-neuvième minute doit être servi.
          expiresAt: result.expiresAt ?? reservationEnd(order.expiresAt),
          // Une seule colonne pour le lien du prestataire ; sa nature — page
          // où l'on va, ou lien à ouvrir à côté — se déduit du moyen.
          redirectUrl: result.redirectUrl ?? result.confirmationUrl ?? null,
          providerPayload: toJson(result.rawResponse),
          failureCode: result.failureCode ?? null,
          failureReason: result.failureReason ?? null,
          failedAt: result.status === 'FAILED' ? new Date() : null,
        },
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.paymentInitiated,
        entityType: 'payment',
        entityId: payment.id,
        actorType: 'USER',
        actorUserId: order.userId ?? undefined,
        changes: {
          provider: provider.code,
          method: route.method.code,
          country: route.countryCode,
          amount: order.totalAmount,
          status: result.status,
          flow,
        },
      });

      return this.toState(updated, reference, {
        instructions: result.instructions,
        widget: isPaymentPending(updated.status) ? (result.widget ?? null) : null,
      });
    } catch (error) {
      await this.prisma.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          kind: 'INITIATE',
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        },
      });

      // Le prestataire n'a pas répondu. Le paiement reste INITIATED, donc en
      // attente : la réconciliation tranchera. Déclarer l'échec ici risquerait
      // de contredire un débit réellement passé.
      this.logger.error({ err: error, paymentId: payment.id }, "Échec d'initiation du paiement");

      throw new BadRequestException(
        "Le service de paiement n'a pas répondu. Réessaie dans quelques instants.",
      );
    }
  }

  /**
   * État d'un paiement, avec rattrapage.
   *
   * L'écran d'attente appelle cette route en boucle. Si le webhook tarde, on
   * interroge le prestataire : c'est ce qui empêche un acheteur débité de
   * rester bloqué sur un anneau de progression.
   */
  async getState(reference: string, paymentId: string): Promise<PaymentState> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, order: { reference } },
    });

    if (!payment) {
      throw new NotFoundException("Ce paiement n'existe pas.");
    }

    if (isPaymentPending(payment.status) && (await this.providerCheckIsDue(payment.id))) {
      await this.pollProvider(payment.id);
    }

    const refreshed = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      ...paymentWithOrder,
    });

    return this.buyerState(refreshed, reference);
  }

  /**
   * L'état à montrer à l'acheteur pour ce paiement.
   *
   * Celui du paiement — sauf quand la commande a été réglée par un AUTRE : un
   * onglet resté sur une tentative abandonnée ne doit pas annoncer « paiement
   * non abouti » pour une commande payée. C'est alors le règlement qui compte,
   * et la page file vers la confirmation.
   */
  private async buyerState(payment: PaymentWithOrder, reference: string): Promise<PaymentState> {
    if (payment.status !== 'SUCCEEDED') {
      const settled = await this.prisma.payment.findFirst({
        where: { orderId: payment.orderId, status: 'SUCCEEDED' },
      });

      if (settled) return this.toState(settled, reference);
    }

    return this.toState(payment, reference, { widget: this.widgetFor(payment) });
  }

  /**
   * La page annonce qu'une transaction a eu lieu dans la fenêtre du prestataire.
   *
   * ── Une piste, pas une preuve ───────────────────────────────────────────
   * La référence vient du navigateur : n'importe quel script de la page peut
   * l'inventer, ou la reprendre d'une autre commande. Elle ne sert qu'à SAVOIR
   * QUOI LIRE chez le prestataire. Ce que la lecture établit — statut, montant,
   * et notre identifiant de paiement rattaché à la transaction — est la seule
   * chose appliquée. Une transaction qui n'appartient pas à ce paiement est
   * refusée et consignée.
   */
  async confirmFromCheckout(
    reference: string,
    paymentId: string,
    providerReference: string,
  ): Promise<PaymentState> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, order: { reference } },
      ...paymentWithOrder,
    });

    if (!payment) {
      throw new NotFoundException("Ce paiement n'existe pas.");
    }

    if (this.flowOf(payment) !== 'widget') {
      throw new BadRequestException('Ce paiement ne se confirme pas depuis la page.');
    }

    // Déjà réglé par cette transaction : rien à relire.
    if (payment.status === 'SUCCEEDED' && payment.providerReference === providerReference) {
      return this.toState(payment, reference);
    }

    const recentChecks = await this.prisma.paymentAttempt.count({
      where: {
        paymentId: payment.id,
        kind: 'STATUS_POLL',
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });

    if (recentChecks >= CHECKOUT_VERIFICATIONS_PER_MINUTE) {
      throw new HttpException(
        'Trop de vérifications pour ce paiement. Patiente une minute : la confirmation arrive aussi toute seule.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const provider = this.registry.get(payment.providerCode as PaymentProviderCode);
    const startedAt = Date.now();
    let verified: ProviderPaymentStatus;

    try {
      verified = await provider.getStatus(providerReference);
    } catch (error) {
      await this.prisma.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          kind: 'STATUS_POLL',
          requestPayload: { providerReference, source: 'checkout' },
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        },
      });

      if (error instanceof ProviderTransactionNotFoundError) {
        await this.rejectTransaction(payment, providerReference, error.message, 'checkout');
        throw new BadRequestException(
          'Cette transaction est introuvable chez le prestataire. Si tu as été débité, ' +
            'garde ta référence de commande : la confirmation peut encore arriver.',
        );
      }

      // Prestataire injoignable : l'issue n'est pas connue, et elle le sera
      // par la notification ou la réconciliation. L'écran d'attente patiente.
      this.logger.warn(
        { err: error, paymentId: payment.id },
        'Vérification demandée par la page impossible — la notification ou la réconciliation conclura',
      );

      return this.toState(payment, reference, { widget: this.widgetFor(payment) });
    }

    await this.prisma.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        kind: 'STATUS_POLL',
        requestPayload: { providerReference, source: 'checkout' },
        responsePayload: toJson(verified),
        durationMs: Date.now() - startedAt,
      },
    });

    const verdict = await this.applyWidgetTransaction(
      payment,
      providerReference,
      verified,
      'checkout',
    );

    if (verdict === 'rejected') {
      throw new BadRequestException(
        'Cette transaction ne correspond pas à ce paiement. Si tu as été débité, garde ta ' +
          'référence de commande et contacte le support.',
      );
    }

    const refreshed = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      ...paymentWithOrder,
    });

    return this.buyerState(refreshed, reference);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Webhooks
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Traite une notification d'encaissement reçue d'un prestataire.
   *
   * L'index unique `(providerCode, externalId)` porte l'idempotence. Un rejeu
   * est reconnu et ignoré ; un rejeu d'un événement dont le traitement avait
   * échoué est en revanche REPRIS, sinon la panne se figerait définitivement.
   *
   * ── La notification n'est pas la vérité ─────────────────────────────────
   * Quand le prestataire n'authentifie ses webhooks que par un secret partagé
   * (`capabilities.verifyWebhookByFetch`), un SUCCÈS annoncé est relu chez
   * lui avant d'être appliqué. Si la relecture échoue, la notification reste
   * `RECEIVED` et la réconciliation reprendra : un billet n'est jamais émis
   * sur la seule foi d'un message entrant.
   */
  async handleWebhook(
    providerCode: PaymentProviderCode,
    event: NormalizedPaymentWebhook,
    rawBody: string,
    signature?: string,
  ): Promise<{
    received: true;
    duplicate: boolean;
    outcome: OutcomeResult | 'unknown_payment' | 'unverified' | 'rejected';
  }> {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { providerCode_externalId: { providerCode, externalId: event.externalId } },
    });

    if (existing && (existing.status === 'PROCESSED' || existing.status === 'IGNORED')) {
      this.logger.log(`Webhook ${providerCode}/${event.externalId} déjà traité — rejeu ignoré`);
      return { received: true, duplicate: true, outcome: 'ignored' };
    }

    let record = existing;

    if (!record) {
      try {
        record = await this.prisma.webhookEvent.create({
          data: { providerCode, externalId: event.externalId, rawBody, signature },
        });
      } catch (error) {
        // Deux livraisons du même événement traitées en même temps — le
        // prestataire a rejoué pendant que la première tournait encore en
        // arrière-plan. L'index unique a tranché : l'autre s'en occupe.
        if (!isUniqueViolation(error)) throw error;

        this.logger.log(
          `Webhook ${providerCode}/${event.externalId} déjà en cours — doublon écarté`,
        );
        return { received: true, duplicate: true, outcome: 'ignored' };
      }
    }

    const payment = await this.findNotifiedPayment(providerCode, event);

    if (!payment) {
      // Peut arriver légitimement : le prestataire notifie parfois avant que
      // notre propre transaction d'initiation ait été validée. On laisse la
      // ligne en RECEIVED pour que la réconciliation la reprenne.
      await this.prisma.webhookEvent.update({
        where: { id: record.id },
        data: {
          status: 'RECEIVED',
          error: `Aucun paiement pour la référence ${event.providerReference}`,
        },
      });

      this.logger.warn(
        `Webhook ${providerCode}/${event.externalId} sans paiement correspondant — conservé pour reprise`,
      );

      return { received: true, duplicate: false, outcome: 'unknown_payment' };
    }

    await this.prisma.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        kind: 'WEBHOOK',
        responsePayload: toJson(event),
      },
    });

    const provider = this.registry.get(providerCode);

    // Fenêtre de paiement : chaque notification décrit UNE tentative, que
    // l'on relit chez le prestataire — succès comme échec — avant d'en tirer
    // quoi que ce soit. Le montant se contrôle sur CETTE lecture (voir
    // `describeBindingProblem`), pas sur ce qu'annonce la notification : un
    // montant de notification compté autrement — frais compris, par exemple —
    // écarterait sinon un paiement que la lecture confirme.
    if (this.flowOf(payment) === 'widget') {
      return this.handleWidgetWebhook(provider, payment, event, record.id, Boolean(existing));
    }

    /**
     * Le montant annoncé doit être celui du paiement.
     *
     * Une notification authentique — signature valide — qui annonce un autre
     * montant ou une autre devise ne peut désigner que deux choses : une
     * erreur du prestataire, ou une notification d'une AUTRE transaction
     * amenée jusqu'ici. Émettre les billets serait la mauvaise réponse aux
     * deux. On refuse d'appliquer, on consigne, et la réconciliation ira lire
     * l'état à la source — qui, elle, ne se trompe pas de montant.
     */
    const mismatch = describeAmountMismatch(payment, event);

    if (mismatch) {
      await this.prisma.webhookEvent.update({
        where: { id: record.id },
        data: { status: 'FAILED', paymentId: payment.id, error: mismatch },
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.paymentWebhookIgnored,
        entityType: 'payment',
        entityId: payment.id,
        actorType: 'SYSTEM',
        changes: { providerCode, reason: mismatch },
      });

      this.logger.error(
        `Webhook ${providerCode}/${event.externalId} incohérent avec le paiement ${payment.id} : ${mismatch}`,
      );

      return { received: true, duplicate: Boolean(existing), outcome: 'ignored' };
    }

    let outcome: PaymentOutcome = {
      status: event.status,
      failureCode: event.failureCode,
      failureReason: event.failureReason,
      providerFeeAmount: event.providerFeeAmount,
      source: 'webhook',
      rawPayload: event,
    };

    if (provider.capabilities.verifyWebhookByFetch && event.status === 'SUCCEEDED') {
      try {
        const verified = await provider.getStatus(event.providerReference);

        outcome = {
          status: verified.status,
          failureCode: verified.failureCode,
          failureReason: verified.failureReason,
          providerFeeAmount: verified.providerFeeAmount ?? event.providerFeeAmount,
          source: 'webhook',
          rawPayload: verified.rawResponse ?? event,
        };

        if (verified.status !== 'SUCCEEDED') {
          this.logger.warn(
            `Webhook ${providerCode}/${event.externalId} annonce un succès que le prestataire ne confirme pas (${verified.status})`,
          );
        }
      } catch (error) {
        await this.prisma.webhookEvent.update({
          where: { id: record.id },
          data: {
            status: 'RECEIVED',
            paymentId: payment.id,
            error: `Relecture impossible : ${error instanceof Error ? error.message : String(error)}`,
          },
        });

        this.logger.warn(
          { err: error, paymentId: payment.id },
          'Webhook reçu, relecture chez le prestataire impossible — la réconciliation reprendra',
        );

        return { received: true, duplicate: Boolean(existing), outcome: 'unverified' };
      }
    }

    const result = await this.applyOutcome(payment.id, outcome);

    await this.prisma.webhookEvent.update({
      where: { id: record.id },
      data: {
        status: result === 'applied' ? 'PROCESSED' : 'IGNORED',
        paymentId: payment.id,
        processedAt: new Date(),
        error: null,
      },
    });

    return { received: true, duplicate: Boolean(existing), outcome: result };
  }

  /**
   * Retrouve le paiement d'une notification : par la référence du
   * prestataire d'abord, puis par NOTRE identifiant quand il le renvoie — le
   * seul lien possible quand la page n'a pas encore transmis la référence de
   * la transaction.
   */
  private async findNotifiedPayment(
    providerCode: PaymentProviderCode,
    event: NormalizedPaymentWebhook,
  ): Promise<PaymentWithOrder | null> {
    const byReference = await this.prisma.payment.findFirst({
      where: { providerCode, providerReference: event.providerReference },
      ...paymentWithOrder,
    });

    if (byReference || !event.merchantReference) return byReference;

    return this.prisma.payment.findFirst({
      where: { id: event.merchantReference, providerCode },
      ...paymentWithOrder,
    });
  }

  private async handleWidgetWebhook(
    provider: PaymentProvider,
    payment: PaymentWithOrder,
    event: NormalizedPaymentWebhook,
    recordId: string,
    duplicate: boolean,
  ): Promise<{
    received: true;
    duplicate: boolean;
    outcome: OutcomeResult | 'unverified' | 'rejected';
  }> {
    let verified: ProviderPaymentStatus;

    try {
      verified = await provider.getStatus(event.providerReference);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof ProviderTransactionNotFoundError) {
        await this.prisma.webhookEvent.update({
          where: { id: recordId },
          data: { status: 'FAILED', paymentId: payment.id, error: message },
        });

        return { received: true, duplicate, outcome: 'rejected' };
      }

      // La transaction est connue désormais : on la rattache, pour que la
      // réconciliation la relise d'elle-même, même si cette notification-ci
      // ne revient jamais. Rattacher n'applique rien — la relecture décidera.
      if (isPaymentPending(payment.status) && !payment.providerReference) {
        await this.bindPendingReference(payment.id, event.providerReference);
      }

      await this.prisma.webhookEvent.update({
        where: { id: recordId },
        data: {
          status: 'RECEIVED',
          paymentId: payment.id,
          error: `Relecture impossible : ${message}`,
        },
      });

      this.logger.warn(
        { err: error, paymentId: payment.id },
        'Webhook reçu, relecture chez le prestataire impossible — la réconciliation reprendra',
      );

      return { received: true, duplicate, outcome: 'unverified' };
    }

    const verdict = await this.applyWidgetTransaction(
      payment,
      event.providerReference,
      verified,
      'webhook',
    );

    await this.prisma.webhookEvent.update({
      where: { id: recordId },
      data:
        verdict === 'rejected'
          ? {
              status: 'FAILED',
              paymentId: payment.id,
              error: describeBindingProblem(payment, verified) ?? 'Transaction refusée',
            }
          : {
              status: verdict === 'applied' ? 'PROCESSED' : 'IGNORED',
              paymentId: payment.id,
              processedAt: new Date(),
              error: null,
            },
    });

    return { received: true, duplicate, outcome: verdict };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Fenêtre de paiement
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Applique ce que le prestataire dit d'UNE transaction faite dans sa fenêtre.
   *
   * ── Le lien d'abord ─────────────────────────────────────────────────────
   * La transaction doit porter NOTRE identifiant de paiement et, si elle a
   * réussi, EXACTEMENT le montant dû. Sinon elle est refusée : une page ne
   * règle pas une commande à 5 000 F avec une transaction de 100 F, ni avec
   * celle d'une autre commande.
   *
   * ── Un échec n'est qu'une tentative ─────────────────────────────────────
   * Dans la fenêtre, l'acheteur peut se tromper de code puis réessayer, sur
   * le MÊME paiement. Un échec y est donc consigné, montré à l'acheteur, et le
   * paiement reste ouvert — jusqu'au succès, ou jusqu'à la fin de la
   * réservation. Le clore au premier échec ferait arriver la tentative
   * suivante, réussie, sur un paiement terminé.
   */
  private async applyWidgetTransaction(
    payment: WidgetPayment,
    providerReference: string,
    verified: ProviderPaymentStatus,
    source: OutcomeSource,
  ): Promise<WidgetVerdict> {
    const problem = describeBindingProblem(payment, verified);

    if (problem) {
      await this.rejectTransaction(payment, providerReference, problem, source);
      return 'rejected';
    }

    if (verified.status === 'SUCCEEDED') {
      // Une SECONDE transaction réussie pour un paiement déjà réglé par une
      // autre : l'acheteur a payé deux fois — deux onglets, une fenêtre
      // rouverte. Rien à émettre de plus, mais de l'argent à rendre.
      if (
        SETTLED_PAYMENT_STATUSES.includes(payment.status) &&
        payment.providerReference !== null &&
        payment.providerReference !== providerReference
      ) {
        await this.flagDuplicate(payment.id, {
          providerReference,
          settledBy: payment.providerReference,
          source,
        });
        return 'ignored';
      }

      try {
        return await this.applyOutcome(payment.id, {
          status: 'SUCCEEDED',
          providerFeeAmount: verified.providerFeeAmount,
          providerReference,
          payerPhone: verified.payerPhone,
          source,
          rawPayload: verified.rawResponse,
        });
      } catch (error) {
        // La transaction est déjà rattachée à un AUTRE paiement : impossible
        // si elle porte bien notre identifiant — sauf manipulation. Refusée.
        if (!isUniqueViolation(error)) throw error;

        await this.rejectTransaction(
          payment,
          providerReference,
          'Transaction déjà rattachée à un autre paiement.',
          source,
        );
        return 'rejected';
      }
    }

    if (!isPaymentPending(payment.status)) {
      // Un échec ou un « en cours » sur un paiement déjà terminé ne change rien.
      return 'unchanged';
    }

    if (verified.status === 'FAILED' || verified.status === 'CANCELLED') {
      const reason = verified.failureReason ?? "Le paiement n'a pas abouti. Réessaie.";

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          failureCode: verified.failureCode ?? 'FAILED',
          failureReason: reason,
          // Cette transaction est close : la réconciliation n'a plus à la
          // relire. La suivante, s'il y en a une, sera rattachée à son tour.
          ...(payment.providerReference === providerReference ? { providerReference: null } : {}),
        },
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.paymentAttemptFailed,
        entityType: 'payment',
        entityId: payment.id,
        actorType: 'SYSTEM',
        changes: { providerReference, reason: verified.failureCode ?? reason, source },
      });

      return 'applied';
    }

    // En cours chez le prestataire : on garde sa référence, pour que la
    // réconciliation la relise si la notification se perd.
    if (payment.providerReference !== providerReference) {
      await this.bindPendingReference(payment.id, providerReference);
    }

    return 'unchanged';
  }

  /**
   * Rattache une transaction EN COURS à un paiement ouvert, sans rien conclure.
   * Une nouvelle tentative efface la cause de l'échec précédent : l'écran ne
   * doit pas annoncer un échec pendant que l'acheteur valide la suivante.
   */
  private async bindPendingReference(paymentId: string, providerReference: string): Promise<void> {
    try {
      await this.prisma.payment.updateMany({
        where: { id: paymentId, status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] } },
        data: { providerReference, failureCode: null, failureReason: null },
      });
    } catch (error) {
      // Déjà rattachée ailleurs : on n'écrase rien, la relecture tranchera.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  /**
   * Consigne un encaissement EN TROP : une seconde transaction réussie sur un
   * paiement déjà réglé, ou un paiement qui aboutit sur une commande que
   * d'autres ont déjà réglée. Rien n'est émis de plus — mais l'argent est à
   * rendre, et le rapprochement le montre.
   *
   * Une fois par transaction, quel que soit le chemin qui la rapporte : la
   * page, la notification et la réconciliation peuvent toutes la voir passer.
   */
  private async flagDuplicate(
    paymentId: string,
    details: {
      providerReference?: string;
      settledBy?: string | null;
      orderId?: string;
      source: OutcomeSource;
    },
  ): Promise<void> {
    const already = await this.prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.paymentDuplicate,
        entityId: paymentId,
        ...(details.providerReference
          ? { changes: { path: ['providerReference'], equals: details.providerReference } }
          : {}),
      },
      select: { id: true },
    });

    if (already) return;

    this.logger.error(
      `Encaissement en trop sur le paiement ${paymentId}` +
        `${details.providerReference ? ` (transaction ${details.providerReference})` : ''} : à rembourser`,
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.paymentDuplicate,
      entityType: 'payment',
      entityId: paymentId,
      actorType: 'SYSTEM',
      changes: {
        ...details,
        reason: 'Encaissé en double : à rembourser depuis le tableau de bord du prestataire',
      },
    });
  }

  private async rejectTransaction(
    payment: { id: string },
    providerReference: string,
    reason: string,
    source: OutcomeSource,
  ): Promise<void> {
    this.logger.warn(
      `Transaction ${providerReference} refusée pour le paiement ${payment.id} (${source}) : ${reason}`,
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.paymentVerificationRejected,
      entityType: 'payment',
      entityId: payment.id,
      actorType: 'SYSTEM',
      changes: { providerReference, reason, source },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Machine à états
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Applique un verdict de prestataire.
   *
   * Point de passage UNIQUE de tout changement d'état d'un paiement : webhook,
   * interrogation, expiration, abandon. Centraliser ici garantit qu'aucun
   * chemin ne contourne la machine à états ni la confirmation de commande.
   *
   * Le verrou `FOR UPDATE` sérialise le cas le plus dangereux : un webhook et
   * une interrogation arrivant en même temps sur le même paiement. Sans lui,
   * les deux pourraient confirmer la commande, et le stock serait décrémenté
   * deux fois.
   *
   * ── Un succès règle la commande… si elle peut encore l'être ─────────────
   *   · commande en attente → payée, billets émis ;
   *   · réservation terminée (succès tardif) → payée si ses places sont
   *     encore libres, sinon laissée telle quelle — l'argent est encaissé,
   *     et le rapprochement montre ce paiement à rembourser ;
   *   · commande déjà réglée par un autre paiement → rien de plus : c'est un
   *     paiement en double, à rembourser, que le rapprochement montre aussi.
   */
  async applyOutcome(paymentId: string, outcome: PaymentOutcome): Promise<OutcomeResult> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          {
            id: string;
            status: PaymentStatus;
            orderId: string;
            payerPhone: string | null;
            countryCode: string;
          }[]
        >`
        SELECT id, status::text AS status, "orderId", "payerPhone", "countryCode"
        FROM payment
        WHERE id = ${paymentId}
        FOR UPDATE
      `;

        const current = locked[0];

        if (!current) {
          throw new NotFoundException("Ce paiement n'existe pas.");
        }

        if (current.status === outcome.status) {
          return 'unchanged' as const;
        }

        if (!canTransitionPayment(current.status, outcome.status)) {
          // Cas le plus important de cette méthode : un échec qui arrive après un
          // succès. L'argent est encaissé, la commande est confirmée. On consigne
          // et on n'applique rien.
          this.logger.warn(
            `Transition refusée ${current.status} → ${outcome.status} sur le paiement ${paymentId} (${outcome.source})`,
          );

          await tx.paymentAttempt.create({
            data: {
              paymentId,
              kind: outcome.source === 'webhook' ? 'WEBHOOK' : 'STATUS_POLL',
              error: `Transition refusée : ${current.status} → ${outcome.status}`,
              responsePayload: toJson(outcome.rawPayload),
            },
          });

          return 'ignored' as const;
        }

        const now = new Date();
        const late = !isPaymentPending(current.status);

        /**
         * ── Un succès sur une commande déjà réglée ne s'applique pas ─────────
         * La base n'admet qu'UN paiement réussi par commande (index
         * `payment_one_success_per_order`), et c'est voulu : les billets, le
         * grand livre et les rapports en dépendent. Un second encaissement —
         * paiement abandonné qui aboutit après coup, commande déjà remboursée —
         * n'est donc pas marqué réussi : il est consigné, à rembourser, et le
         * rapprochement le montre. Tranché AVANT d'écrire, sous le verrou de la
         * commande, pour qu'aucune course ne le fasse passer.
         */
        let orderStatus: string | null = null;

        if (outcome.status === 'SUCCEEDED') {
          const orders = await tx.$queryRaw<{ status: string }[]>`
            SELECT status::text AS status FROM "order" WHERE id = ${current.orderId} FOR UPDATE
          `;

          orderStatus = orders[0]?.status ?? null;

          const settledElsewhere = await tx.payment.findFirst({
            where: { orderId: current.orderId, status: 'SUCCEEDED', id: { not: paymentId } },
            select: { id: true },
          });

          if (settledElsewhere || SETTLED_ORDER_STATUSES.includes(orderStatus ?? '')) {
            return { duplicate: true, orderId: current.orderId } as const;
          }
        }

        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: outcome.status,
            failureCode: outcome.failureCode ?? null,
            failureReason: outcome.failureReason ?? null,
            confirmedAt: outcome.status === 'SUCCEEDED' ? now : undefined,
            failedAt: outcome.status === 'FAILED' || outcome.status === 'EXPIRED' ? now : undefined,
            webhookReceivedAt: outcome.source === 'webhook' ? now : undefined,
            // Les frais réels du prestataire, tels qu'il les annonce : c'est
            // cette valeur que le grand livre consigne en `PROVIDER_FEE`.
            providerFeeAmount:
              outcome.status === 'SUCCEEDED' ? (outcome.providerFeeAmount ?? 0) : undefined,
            providerReference: outcome.providerReference,
            // Le numéro que le prestataire dit avoir débité, remis à NOTRE
            // format — Kkiapay peut l'écrire selon l'ancien plan béninois à
            // huit chiffres. Illisible pour ce pays : on ne l'écrit pas.
            payerPhone:
              current.payerPhone === null && outcome.payerPhone
                ? (tryNormalizePhoneForCountry(outcome.payerPhone, current.countryCode) ??
                  undefined)
                : undefined,
            providerPayload:
              outcome.rawPayload === undefined ? undefined : toJson(outcome.rawPayload),
          },
        });

        // Commande encore en attente — ou réservation écoulée, que `markPaid`
        // honore si les places sont encore libres (`secureForPayment`).
        const settlement: Settlement | null =
          outcome.status === 'SUCCEEDED'
            ? await this.orders.markPaid(tx, current.orderId, now, outcome.providerFeeAmount ?? 0)
            : null;

        // Un échec ne touche PAS à la commande : elle reste en AWAITING_PAYMENT
        // et ses places restent réservées jusqu'à l'expiration, pour que
        // l'acheteur puisse réessayer avec un autre numéro ou un autre moyen.
        // « Aucun montant n'a été débité · panier conservé » (écran A6).

        return { orderId: current.orderId, settlement, late } as const;
      },
      {
        /**
         * ── Pourquoi la transaction qui ENCAISSE a les délais les plus longs ──
         * Elle en fait plus que toutes les autres : verrou sur le paiement,
         * confirmation du stock, mise à jour de la commande et des compteurs de
         * l'événement, création du compte silencieux, émission des billets, trois
         * écritures au grand livre, et la notification de confirmation.
         *
         * Le test de vente flash l'a montré : avec les délais par défaut, 143
         * paiements sur 200 restaient en `PROCESSING` pendant que l'argent était
         * encaissé. Attendre une connexion vaut mieux qu'échouer.
         */
        maxWait: 20_000,
        timeout: 20_000,
      },
    );

    if (result === 'unchanged' || result === 'ignored') {
      if (result === 'ignored') {
        await this.audit.record({
          action: AUDIT_ACTIONS.paymentWebhookIgnored,
          entityType: 'payment',
          entityId: paymentId,
          actorType: 'SYSTEM',
          changes: { attemptedStatus: outcome.status, source: outcome.source },
        });
      }
      return result;
    }

    if ('duplicate' in result) {
      await this.flagDuplicate(paymentId, {
        providerReference: outcome.providerReference,
        orderId: result.orderId,
        source: outcome.source,
      });
      return 'ignored';
    }

    await this.afterTransition(paymentId, result.orderId, outcome, result.settlement, result.late);

    return 'applied';
  }

  /**
   * Interroge le prestataire sur un paiement en attente.
   *
   * C'est le filet contre le webhook perdu. Renvoie `true` si l'état a changé.
   */
  async pollProvider(paymentId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      ...paymentWithOrder,
    });

    if (!payment || !isPaymentPending(payment.status)) {
      return false;
    }

    // Rien à lire chez le prestataire — fenêtre de paiement pas encore
    // validée, ou prestataire muet à l'initiation : seule l'échéance conclut.
    if (!payment.providerReference) {
      return this.expireIfDue(payment);
    }

    if (!this.registry.has(payment.providerCode as PaymentProviderCode)) {
      // Le prestataire de ce paiement n'est plus branché — ses clés ont été
      // retirées. Rien à interroger : l'expiration conclura.
      return this.expireIfDue(payment);
    }

    const provider = this.registry.get(payment.providerCode as PaymentProviderCode);

    if (!provider.capabilities.statusPolling) {
      return false;
    }

    const startedAt = Date.now();
    let status: ProviderPaymentStatus;

    try {
      status = await provider.getStatus(payment.providerReference);
    } catch (error) {
      await this.prisma.paymentAttempt.create({
        data: {
          paymentId,
          kind: 'STATUS_POLL',
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        },
      });

      this.logger.warn({ err: error, paymentId }, 'Interrogation du prestataire en échec');

      // Une transaction que le prestataire ne connaît pas ne se lira jamais :
      // pour une fenêtre de paiement, on la détache — l'échéance conclura.
      if (error instanceof ProviderTransactionNotFoundError && this.flowOf(payment) === 'widget') {
        await this.prisma.payment.updateMany({
          where: { id: paymentId, providerReference: payment.providerReference },
          data: { providerReference: null },
        });
      }

      return this.expireIfDue(payment);
    }

    await this.prisma.paymentAttempt.create({
      data: {
        paymentId,
        kind: 'STATUS_POLL',
        responsePayload: toJson(status),
        durationMs: Date.now() - startedAt,
      },
    });

    if (this.flowOf(payment) === 'widget') {
      const verdict = await this.applyWidgetTransaction(
        payment,
        payment.providerReference,
        status,
        'poll',
      );

      if (verdict === 'applied' && status.status === 'SUCCEEDED') {
        await this.recordRecovery(paymentId, payment.providerCode);
        return true;
      }

      return (await this.expireIfDue(payment)) || verdict === 'applied';
    }

    // L'expiration est décidée par NOUS, pas par le prestataire : passé le
    // délai annoncé à l'acheteur, une demande toujours en attente est abandonnée.
    const expired =
      isPaymentPending(status.status) &&
      payment.expiresAt !== null &&
      payment.expiresAt.getTime() < Date.now();

    const outcome: PaymentOutcome = expired
      ? {
          status: 'EXPIRED',
          failureReason: "La demande n'a pas été validée à temps.",
          source: 'expiry',
        }
      : {
          status: status.status,
          failureCode: status.failureCode,
          failureReason: status.failureReason,
          providerFeeAmount: status.providerFeeAmount,
          source: 'poll',
          rawPayload: status.rawResponse,
        };

    if (!expired && status.status === payment.status) {
      return false;
    }

    const applied = await this.applyOutcome(paymentId, outcome);

    if (applied === 'applied' && outcome.source === 'poll' && outcome.status === 'SUCCEEDED') {
      await this.recordRecovery(paymentId, payment.providerCode);
    }

    return applied === 'applied';
  }

  /**
   * Ce paiement peut-il recevoir, à la main, une transaction du prestataire ?
   * Seulement s'il se valide dans la fenêtre du prestataire — les autres
   * reçoivent leur référence à l'initiation — et s'il n'est pas déjà réglé.
   */
  canAttachTransaction(payment: {
    providerCode: string;
    methodCode: string;
    status: PaymentStatus;
  }): boolean {
    return this.flowOf(payment) === 'widget' && !SETTLED_PAYMENT_STATUSES.includes(payment.status);
  }

  /**
   * Rattache à la main une transaction du prestataire à un paiement.
   *
   * Depuis la console, quand un acheteur débité se présente au support avec
   * la référence de sa transaction : ni sa page ni la notification ne nous
   * ont rapporté l'issue. La référence est lue chez le prestataire et n'est
   * retenue que si elle porte l'identifiant de CE paiement et le bon montant
   * — exactement comme celle que rapporte la page. Réussie, elle règle la
   * commande, même après la fin de la réservation si les places sont encore
   * libres ; sinon le paiement est signalé, à rembourser.
   */
  async attachTransaction(
    paymentId: string,
    providerReference: string,
    actorUserId: string,
  ): Promise<AttachPaymentTransactionResult> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment) {
      throw new NotFoundException("Ce paiement n'existe pas.");
    }

    if (payment.status === 'SUCCEEDED' && payment.providerReference === providerReference) {
      return { outcome: 'already', message: 'Ce paiement est déjà réglé par cette transaction.' };
    }

    if (!this.canAttachTransaction(payment)) {
      throw new BadRequestException(
        this.flowOf(payment) === 'widget'
          ? 'Ce paiement est déjà réglé : une autre transaction ne peut plus lui être rattachée.'
          : 'Ce paiement ne se valide pas dans la fenêtre d’un prestataire : sa transaction lui est rattachée d’office.',
      );
    }

    const label = getPaymentProviderDefinition(payment.providerCode)?.label ?? payment.providerCode;
    const provider = this.registry.get(payment.providerCode as PaymentProviderCode);
    const startedAt = Date.now();
    let verified: ProviderPaymentStatus;

    try {
      verified = await provider.getStatus(providerReference);
    } catch (error) {
      await this.prisma.paymentAttempt.create({
        data: {
          paymentId,
          kind: 'STATUS_POLL',
          requestPayload: { providerReference, source: 'admin' },
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        },
      });

      if (error instanceof ProviderTransactionNotFoundError) {
        throw new BadRequestException(error.message);
      }

      throw new HttpException(
        `${label} ne répond pas : réessaie dans un instant.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    await this.prisma.paymentAttempt.create({
      data: {
        paymentId,
        kind: 'STATUS_POLL',
        requestPayload: { providerReference, source: 'admin' },
        responsePayload: toJson(verified),
        durationMs: Date.now() - startedAt,
      },
    });

    const verdict = await this.applyWidgetTransaction(
      payment,
      providerReference,
      verified,
      'admin',
    );

    if (verdict === 'rejected') {
      throw new BadRequestException(
        describeBindingProblem(payment, verified) ??
          'Cette transaction ne correspond pas à ce paiement.',
      );
    }

    await this.audit.record({
      action: AUDIT_ACTIONS.paymentTransactionAttached,
      entityType: 'payment',
      entityId: paymentId,
      actorType: 'ADMIN',
      actorUserId,
      changes: { providerReference, status: verified.status },
    });

    if (verified.status === 'FAILED' || verified.status === 'CANCELLED') {
      return {
        outcome: 'failed',
        message: `Cette transaction a échoué chez ${label} : rien n'a été encaissé. ${
          verified.failureReason ?? ''
        }`.trim(),
      };
    }

    if (verified.status !== 'SUCCEEDED') {
      return {
        outcome: 'pending',
        message: `Cette transaction est encore en cours chez ${label}. Elle est rattachée au paiement et sera relue automatiquement.`,
      };
    }

    const after = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { status: true, order: { select: { status: true } } },
    });

    // Non appliqué alors que Kkiapay confirme : la commande était déjà réglée
    // par un autre paiement (voir `applyOutcome`) — un encaissement en trop.
    if (after.status !== 'SUCCEEDED') {
      return {
        outcome: 'duplicate',
        message:
          'Transaction encaissée, mais la commande était déjà réglée : ' +
          `rembourse ce paiement en double depuis le tableau de bord de ${label}.`,
      };
    }

    if (after.order.status !== 'PAID' && after.order.status !== 'COMPLETED') {
      return {
        outcome: 'unfulfillable',
        message:
          'Transaction encaissée, mais les places de la commande ne sont plus disponibles : ' +
          `rembourse l'acheteur depuis le tableau de bord de ${label}.`,
      };
    }

    return {
      outcome: 'settled',
      message: 'Transaction encaissée : la commande est payée et les billets sont émis.',
    };
  }

  /**
   * Relit UNE transaction précise chez le prestataire et applique ce qu'elle
   * dit.
   *
   * Pour la réconciliation, qui retrouve une notification restée sans
   * paiement : la transaction qu'elle nomme peut n'être rattachée à rien
   * encore (fenêtre de paiement). Pour un paiement qui ne se valide pas dans
   * une fenêtre, c'est l'interrogation ordinaire, sur la référence connue.
   */
  async reconcileTransaction(paymentId: string, providerReference: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment) return false;

    if (this.flowOf(payment) !== 'widget') return this.pollProvider(paymentId);

    const provider = this.registry.get(payment.providerCode as PaymentProviderCode);
    const startedAt = Date.now();

    try {
      const verified = await provider.getStatus(providerReference);

      await this.prisma.paymentAttempt.create({
        data: {
          paymentId,
          kind: 'STATUS_POLL',
          requestPayload: { providerReference, source: 'reconciliation' },
          responsePayload: toJson(verified),
          durationMs: Date.now() - startedAt,
        },
      });

      const verdict = await this.applyWidgetTransaction(
        payment,
        providerReference,
        verified,
        'poll',
      );

      if (verdict === 'applied' && verified.status === 'SUCCEEDED') {
        await this.recordRecovery(paymentId, payment.providerCode);
      }

      return verdict === 'applied';
    } catch (error) {
      await this.prisma.paymentAttempt.create({
        data: {
          paymentId,
          kind: 'STATUS_POLL',
          requestPayload: { providerReference, source: 'reconciliation' },
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        },
      });

      this.logger.warn({ err: error, paymentId }, 'Relecture de transaction impossible');
      return false;
    }
  }

  /**
   * Clôt un paiement en attente dont l'échéance est passée.
   *
   * Pour la réconciliation, qui balaie aussi les paiements sans référence de
   * prestataire — une fenêtre de paiement ouverte puis abandonnée n'en a
   * jamais reçu.
   */
  async expireIfOverdue(paymentId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment || !isPaymentPending(payment.status)) return false;

    return this.expireIfDue(payment);
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async expireIfDue(payment: { id: string; expiresAt: Date | null }): Promise<boolean> {
    if (payment.expiresAt === null || payment.expiresAt.getTime() >= Date.now()) return false;

    const applied = await this.applyOutcome(payment.id, {
      status: 'EXPIRED',
      failureReason: "La demande n'a pas été validée à temps.",
      source: 'expiry',
    });

    return applied === 'applied';
  }

  /** Le webhook ne nous est jamais parvenu : l'écart alimente le KPI de fiabilité. */
  private async recordRecovery(paymentId: string, providerCode: string): Promise<void> {
    await this.audit.record({
      action: AUDIT_ACTIONS.paymentReconciled,
      entityType: 'payment',
      entityId: paymentId,
      actorType: 'SYSTEM',
      changes: { providerCode, recoveredBy: 'status_poll' },
    });
  }

  /**
   * L'écran d'attente interroge toutes les trois secondes ; le prestataire,
   * lui, n'est relu qu'à intervalle raisonnable.
   */
  private async providerCheckIsDue(paymentId: string): Promise<boolean> {
    const recent = await this.prisma.paymentAttempt.findFirst({
      where: {
        paymentId,
        kind: 'STATUS_POLL',
        createdAt: { gt: new Date(Date.now() - PAGE_POLL_MIN_INTERVAL_MS) },
      },
      select: { id: true },
    });

    return recent === null;
  }

  /** Comment se valide ce paiement, selon son prestataire — `null` s'il n'est plus branché. */
  private flowOf(payment: { providerCode: string; methodCode: string }): CheckoutFlow | null {
    const code = payment.providerCode as PaymentProviderCode;
    const kind = getPaymentMethodDefinition(payment.methodCode)?.kind;

    if (!kind || !this.registry.has(code)) return null;

    return this.registry.get(code).checkoutFlow(kind);
  }

  /**
   * Fenêtre de paiement d'un paiement encore ouvert, reconstruite à la
   * demande : rouvrir après une fenêtre fermée, reprendre après un
   * rechargement. `null` pour tout paiement qui ne s'y valide pas.
   */
  private widgetFor(payment: PaymentWithOrder): PaymentWidget | null {
    if (!isPaymentPending(payment.status) || this.flowOf(payment) !== 'widget') return null;

    const provider = this.registry.get(payment.providerCode as PaymentProviderCode);
    const kind = getPaymentMethodDefinition(payment.methodCode)?.kind;

    if (!provider.widget || !kind) return null;

    const input: ProviderInitiateInput = {
      paymentId: payment.id,
      orderReference: payment.order.reference,
      amount: payment.amount,
      currency: payment.currency,
      countryCode: payment.countryCode,
      method: {
        code: payment.methodCode as PaymentMethodCode,
        kind,
        providerMethodCode:
          resolveProviderMethodCode(
            payment.providerCode,
            payment.methodCode as PaymentMethodCode,
            payment.countryCode,
          ) ?? payment.methodCode,
      },
      customer: {
        name: payment.order.buyerName,
        phone: payment.order.buyerPhone,
        email: payment.order.buyerEmail ?? undefined,
      },
      description: `Nexa-Kabi · ${payment.order.event.title}`,
      returnUrls: this.returnUrls(payment.order.reference, payment.id),
    };

    return provider.widget(input);
  }

  /**
   * Adresses de retour d'une page de paiement hébergée.
   *
   * Les deux ramènent sur l'écran d'attente de la commande, avec l'identifiant
   * du paiement : c'est l'interrogation qui dit ensuite ce qu'il en est. Le
   * paramètre `retour` n'est qu'une indication d'affichage — jamais une preuve.
   */
  private returnUrls(reference: string, paymentId: string): { success: string; error: string } {
    const base = `${this.webUrl}/checkout/${encodeURIComponent(reference)}/paiement`;
    const query = `paiement=${encodeURIComponent(paymentId)}`;

    return {
      success: `${base}?${query}&retour=succes`,
      error: `${base}?${query}&retour=echec`,
    };
  }

  private async afterTransition(
    paymentId: string,
    orderId: string,
    outcome: PaymentOutcome,
    settlement: Settlement | null,
    late: boolean,
  ): Promise<void> {
    if (outcome.status === 'SUCCEEDED') {
      await this.audit.record({
        action: AUDIT_ACTIONS.paymentSucceeded,
        entityType: 'payment',
        entityId: paymentId,
        actorType: 'SYSTEM',
        changes: { orderId, source: outcome.source, settlement, late },
      });

      if (settlement === 'paid') {
        if (late) {
          await this.audit.record({
            action: AUDIT_ACTIONS.paymentLateSettled,
            entityType: 'payment',
            entityId: paymentId,
            actorType: 'SYSTEM',
            changes: { orderId, source: outcome.source },
          });
        }

        // La phase 7 s'y abonne pour émettre les billets. L'émission ne peut pas
        // vivre ici : elle appartient au domaine du billet, pas du paiement.
        this.events.emit('order.paid', { orderId, paymentId });
        return;
      }

      // Encaissé, mais sans commande à honorer : le rapprochement le montre
      // (« paiement réussi, commande non payée »), et un remboursement doit
      // suivre. Le journal le crie dès maintenant.
      this.logger.error(
        `Paiement ${paymentId} encaissé sur la commande ${orderId}, dont les places ne sont plus disponibles : à rembourser`,
      );

      await this.audit.record({
        action: AUDIT_ACTIONS.paymentUnfulfillable,
        entityType: 'payment',
        entityId: paymentId,
        actorType: 'SYSTEM',
        changes: {
          orderId,
          source: outcome.source,
          reason: 'Places plus disponibles : à rembourser depuis le tableau de bord du prestataire',
        },
      });
      return;
    }

    if (outcome.status === 'FAILED' || outcome.status === 'EXPIRED') {
      await this.audit.record({
        action: AUDIT_ACTIONS.paymentFailed,
        entityType: 'payment',
        entityId: paymentId,
        actorType: 'SYSTEM',
        changes: { orderId, reason: outcome.failureCode ?? outcome.status, source: outcome.source },
      });
    }
  }

  private toState(
    payment: {
      id: string;
      providerCode: string;
      methodCode: string;
      status: PaymentStatus;
      amount: number;
      currency: string;
      payerPhone: string | null;
      expiresAt: Date | null;
      failureReason: string | null;
      redirectUrl: string | null;
    },
    reference: string,
    extras: { instructions?: string; widget?: PaymentWidget | null } = {},
  ): PaymentState {
    const method = payment.methodCode as PaymentMethodCode;
    const pending = isPaymentPending(payment.status);

    return {
      paymentId: payment.id,
      orderReference: reference,
      status: payment.status,
      method,
      methodLabel: getPaymentMethodDefinition(method)?.label ?? method,
      provider: payment.providerCode as PaymentProviderCode,
      amount: payment.amount,
      currency: payment.currency,
      // Jamais le numéro complet : cet écran est souvent montré à quelqu'un
      // d'autre pour qu'il valide le paiement.
      maskedPayerPhone: payment.payerPhone ? safeMask(payment.payerPhone) : '',
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      instructions: extras.instructions ?? null,
      // Le lien du prestataire n'a de sens que tant que le paiement attend.
      // Pour la carte, c'est la page où le tunnel ENVOIE l'acheteur ; pour le
      // Mobile Money, un lien de validation à ouvrir à côté de l'écran d'attente.
      redirectUrl:
        pending && getPaymentMethodDefinition(method)?.kind === 'CARD' ? payment.redirectUrl : null,
      confirmationUrl:
        pending && getPaymentMethodDefinition(method)?.kind !== 'CARD' ? payment.redirectUrl : null,
      widget: pending ? (extras.widget ?? null) : null,
      failureReason: payment.failureReason,
    };
  }
}

/** Fin de la réservation, ou à défaut la durée d'une réservation à partir de maintenant. */
function reservationEnd(orderExpiresAt: Date | null): Date {
  return orderExpiresAt ?? new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
}

/**
 * Pourquoi une transaction ne peut pas régler ce paiement — `null` si elle le peut.
 *
 * Elle doit porter NOTRE identifiant de paiement ; et, réussie, exactement le
 * montant dû. Un montant absent ne se présume pas : il se refuse.
 */
function describeBindingProblem(
  payment: { id: string; amount: number },
  verified: ProviderPaymentStatus,
): string | null {
  if (verified.merchantReference !== payment.id) {
    return verified.merchantReference
      ? `Transaction rattachée au paiement ${verified.merchantReference}, pas à celui-ci.`
      : 'Transaction sans référence Nexa-Kabi : elle ne vient pas de ce paiement.';
  }

  if (verified.status === 'SUCCEEDED') {
    if (verified.amount === undefined) {
      return 'Montant non communiqué par le prestataire : impossible de vérifier ce paiement.';
    }

    if (verified.amount !== payment.amount) {
      return `Montant annoncé ${verified.amount}, attendu ${payment.amount}.`;
    }
  }

  return null;
}

/**
 * Écart entre ce qu'annonce une notification et ce que porte le paiement.
 *
 * `null` quand tout concorde — ou quand la notification ne dit rien du
 * montant, ce qui est le cas de plusieurs prestataires et n'a rien de
 * suspect. On ne contrôle que ce qui est affirmé.
 */
function describeAmountMismatch(
  payment: { amount: number; currency: string },
  event: NormalizedPaymentWebhook,
): string | null {
  if (event.amount !== undefined && event.amount !== payment.amount) {
    return `montant annoncé ${event.amount}, attendu ${payment.amount}`;
  }

  if (
    event.currency !== undefined &&
    event.currency.toUpperCase() !== payment.currency.toUpperCase()
  ) {
    return `devise annoncée ${event.currency}, attendue ${payment.currency}`;
  }

  return null;
}

/**
 * Masque un numéro sans jamais faire échouer la réponse : un numéro que nos
 * règles ne savent pas lire s'affiche vide plutôt que de rendre l'écran
 * d'attente inutilisable au moment où l'acheteur vient de payer.
 */
function safeMask(phone: string): string {
  try {
    return maskPhone(phone);
  } catch {
    return '';
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

/** Convertit une valeur inconnue en JSON stockable par Prisma. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
