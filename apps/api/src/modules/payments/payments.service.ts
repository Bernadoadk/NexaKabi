import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  canTransitionPayment,
  getPaymentMethodDefinition,
  isPaymentPending,
  paymentMethodRequiresPhone,
  type CheckoutPaymentMethods,
  type InitiatePaymentInput,
  type PaymentMethodCode,
  type PaymentState,
  type PaymentStatus,
  type PaymentProviderCode,
} from '@nexakabi/contracts';
import { maskPhone } from '@nexakabi/utils';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { CountriesService } from '../countries/countries.service';
import { OrdersService } from '../orders/orders.service';
import type { Prisma } from '../../generated/prisma/client';
import { PaymentRoutingService } from './payment-routing.service';
import { PaymentProviderRegistry } from './provider.registry';
import type { NormalizedPaymentWebhook } from './providers/payment-provider';

/** Origine d'un changement d'état, conservée pour le diagnostic. */
export type OutcomeSource = 'initiate' | 'webhook' | 'poll' | 'expiry';

export interface PaymentOutcome {
  readonly status: PaymentStatus;
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly providerFeeAmount?: number;
  readonly source: OutcomeSource;
  readonly rawPayload?: unknown;
}

export type OutcomeResult = 'applied' | 'ignored' | 'unchanged';

/**
 * Paiements.
 *
 * La partie la plus risquée du produit. Trois faits gouvernent sa conception :
 *
 *  1. **Le Mobile Money est asynchrone.** L'utilisateur quitte l'écran pour
 *     valider sur son téléphone. Le navigateur ne sait rien ; seul le
 *     prestataire sait. Aucun délai côté client ne doit donc conclure à l'échec.
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

    // Le numéro appartient au pays de paiement, pas à celui de l'identifiant
    // de connexion : un payeur sénégalais donne un numéro en +221.
    const payerPhone = paymentMethodRequiresPhone(route.method.kind)
      ? this.countries.normalizePhone(input.payerPhone ?? '', country)
      : null;

    if (paymentMethodRequiresPhone(route.method.kind) && !payerPhone) {
      throw new BadRequestException('Indique le numéro Mobile Money à débiter.');
    }

    const inFlight = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (inFlight) {
      // Une demande identique en cours : on renvoie la même, sans rappeler
      // le prestataire. Une demande sur un AUTRE numéro ou moyen suppose que
      // la première a échoué côté client — elle est abandonnée explicitement.
      if (inFlight.methodCode === input.method && inFlight.payerPhone === payerPhone) {
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
      const winner = await this.prisma.payment.findUnique({ where: { idempotencyKey } });

      if (!winner) throw error;

      this.logger.log(
        `Demande de paiement concurrente sur ${order.reference} — reprise du gagnant`,
      );
      return this.toState(winner, reference);
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
          },
          responsePayload: toJson(result.rawResponse),
          durationMs: Date.now() - startedAt,
        },
      });

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerReference: result.providerReference,
          status: result.status,
          expiresAt: result.expiresAt,
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
        },
      });

      return this.toState(updated, reference, result.instructions);
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

    if (isPaymentPending(payment.status)) {
      await this.pollProvider(payment.id);

      const refreshed = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      return this.toState(refreshed, reference);
    }

    return this.toState(payment, reference);
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
    outcome: OutcomeResult | 'unknown_payment' | 'unverified';
  }> {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { providerCode_externalId: { providerCode, externalId: event.externalId } },
    });

    if (existing && (existing.status === 'PROCESSED' || existing.status === 'IGNORED')) {
      this.logger.log(`Webhook ${providerCode}/${event.externalId} déjà traité — rejeu ignoré`);
      return { received: true, duplicate: true, outcome: 'ignored' };
    }

    const record =
      existing ??
      (await this.prisma.webhookEvent.create({
        data: { providerCode, externalId: event.externalId, rawBody, signature },
      }));

    const payment = await this.prisma.payment.findFirst({
      where: { providerCode, providerReference: event.providerReference },
    });

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

    const provider = this.registry.get(providerCode);

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
   */
  async applyOutcome(paymentId: string, outcome: PaymentOutcome): Promise<OutcomeResult> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string; status: PaymentStatus; orderId: string }[]>`
        SELECT id, status::text AS status, "orderId"
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
            providerPayload:
              outcome.rawPayload === undefined ? undefined : toJson(outcome.rawPayload),
          },
        });

        if (outcome.status === 'SUCCEEDED') {
          await this.orders.markPaid(tx, current.orderId, now, outcome.providerFeeAmount ?? 0);
        }

        // Un échec ne touche PAS à la commande : elle reste en AWAITING_PAYMENT
        // et ses places restent réservées jusqu'à l'expiration, pour que
        // l'acheteur puisse réessayer avec un autre numéro ou un autre moyen.
        // « Aucun montant n'a été débité · panier conservé » (écran A6).

        return { orderId: current.orderId } as const;
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

    await this.afterTransition(paymentId, result.orderId, outcome);

    return 'applied';
  }

  /**
   * Interroge le prestataire sur un paiement en attente.
   *
   * C'est le filet contre le webhook perdu. Renvoie `true` si l'état a changé.
   */
  async pollProvider(paymentId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment || !payment.providerReference || !isPaymentPending(payment.status)) {
      return false;
    }

    if (!this.registry.has(payment.providerCode as PaymentProviderCode)) {
      // Le prestataire de ce paiement n'est plus branché — clé retirée, ou
      // simulateur en production. Rien à interroger : l'expiration conclura.
      return this.expireIfDue(payment);
    }

    const provider = this.registry.get(payment.providerCode as PaymentProviderCode);

    if (!provider.capabilities.statusPolling) {
      return false;
    }

    const startedAt = Date.now();

    try {
      const status = await provider.getStatus(payment.providerReference);

      await this.prisma.paymentAttempt.create({
        data: {
          paymentId,
          kind: 'STATUS_POLL',
          responsePayload: toJson(status),
          durationMs: Date.now() - startedAt,
        },
      });

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
        // Le webhook ne nous est jamais parvenu : l'écart est consigné, il
        // alimente le KPI de fiabilité du prestataire.
        await this.audit.record({
          action: AUDIT_ACTIONS.paymentReconciled,
          entityType: 'payment',
          entityId: paymentId,
          actorType: 'SYSTEM',
          changes: { providerCode: payment.providerCode, recoveredBy: 'status_poll' },
        });
      }

      return applied === 'applied';
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
      return false;
    }
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
  ): Promise<void> {
    if (outcome.status === 'SUCCEEDED') {
      await this.audit.record({
        action: AUDIT_ACTIONS.paymentSucceeded,
        entityType: 'payment',
        entityId: paymentId,
        actorType: 'SYSTEM',
        changes: { orderId, source: outcome.source },
      });

      // La phase 7 s'y abonne pour émettre les billets. L'émission ne peut pas
      // vivre ici : elle appartient au domaine du billet, pas du paiement.
      this.events.emit('order.paid', { orderId, paymentId });
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
    instructions?: string,
  ): PaymentState {
    const method = payment.methodCode as PaymentMethodCode;

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
      maskedPayerPhone: payment.payerPhone ? maskPhone(payment.payerPhone) : '',
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      instructions: instructions ?? null,
      // Le lien du prestataire n'a de sens que tant que le paiement attend.
      // Pour la carte, c'est la page où le tunnel ENVOIE l'acheteur ; pour le
      // Mobile Money, un lien de validation à ouvrir à côté de l'écran d'attente.
      redirectUrl:
        isPaymentPending(payment.status) && getPaymentMethodDefinition(method)?.kind === 'CARD'
          ? payment.redirectUrl
          : null,
      confirmationUrl:
        isPaymentPending(payment.status) && getPaymentMethodDefinition(method)?.kind !== 'CARD'
          ? payment.redirectUrl
          : null,
      failureReason: payment.failureReason,
    };
  }
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
