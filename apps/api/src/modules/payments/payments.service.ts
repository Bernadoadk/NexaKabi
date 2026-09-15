import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PAYMENT_METHOD_CATALOGUE,
  canTransitionPayment,
  isPaymentPending,
  type InitiatePaymentInput,
  type PaymentMethod,
  type PaymentState,
  type PaymentStatus,
  type PaymentProviderCode,
} from '@nexakabi/contracts';
import { maskPhone } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { OrdersService } from '../orders/orders.service';
import type { Prisma } from '../../generated/prisma/client';
import { PaymentProviderRegistry } from './provider.registry';
import type { NormalizedWebhookEvent } from './providers/payment-provider';

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
 *     valider sur son téléphone. Le navigateur ne sait rien ; seul l'opérateur
 *     sait. Aucun délai côté client ne doit donc conclure à l'échec.
 *  2. **Les opérateurs rejouent leurs webhooks**, parfois dans le désordre.
 *     L'idempotence n'est pas une précaution, c'est une condition de
 *     fonctionnement.
 *  3. **Un webhook se perd.** La réconciliation par interrogation n'est pas un
 *     filet de secours facultatif : sans elle, un client payé reste sans billet.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Moyens de paiement à proposer.
   *
   * `available` reflète les fournisseurs réellement branchés : mieux vaut
   * masquer un moyen que le laisser échouer après la saisie du numéro.
   */
  listMethods(): PaymentMethod[] {
    return PAYMENT_METHOD_CATALOGUE.map((method) => ({
      ...method,
      available: !method.comingSoon && this.registry.has(method.provider),
    })).filter((method) => method.available || method.comingSoon);
  }

  /**
   * Déclenche une demande de paiement.
   *
   * Idempotent sur le double-clic : tant qu'une demande est en cours pour cette
   * commande, la même est renvoyée. Sans cela, deux appels opérateur partiraient
   * et l'acheteur pourrait être débité deux fois.
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

    const inFlight = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (inFlight) {
      // Une demande identique en cours : on renvoie la même, sans rappeler
      // l'opérateur. Une demande sur un AUTRE numéro ou opérateur suppose que
      // la première a échoué côté client — elle est abandonnée explicitement.
      if (inFlight.providerCode === input.provider && inFlight.payerPhone === input.payerPhone) {
        return this.toState(inFlight, reference);
      }

      await this.applyOutcome(inFlight.id, {
        status: 'CANCELLED',
        failureReason: "Remplacée par une nouvelle demande de l'acheteur.",
        source: 'initiate',
      });
    }

    const provider = this.registry.get(input.provider);

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
          // Clé déterministe : deux appels simultanés calculent le même rang et
          // se heurtent à l'index unique. C'est voulu — l'un crée le paiement,
          // l'autre est renvoyé vers celui-là.
          idempotencyKey,
          amount: order.totalAmount,
          currency: order.currency,
          payerPhone: input.payerPhone,
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
        payerPhone: input.payerPhone,
        description: `Nexa-Kabi · ${order.event.title}`,
      });

      await this.prisma.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          kind: 'INITIATE',
          requestPayload: { provider: provider.code, amount: order.totalAmount },
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
        changes: { provider: provider.code, amount: order.totalAmount, status: result.status },
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

      // L'opérateur n'a pas répondu. Le paiement reste INITIATED, donc en
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
   * interroge l'opérateur : c'est ce qui empêche un acheteur débité de rester
   * bloqué sur un anneau de progression.
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
   * Traite un événement reçu d'un opérateur.
   *
   * L'index unique `(providerCode, externalId)` porte l'idempotence. Un rejeu
   * est reconnu et ignoré ; un rejeu d'un événement dont le traitement avait
   * échoué est en revanche REPRIS, sinon la panne se figerait définitivement.
   */
  async handleWebhook(
    providerCode: PaymentProviderCode,
    event: NormalizedWebhookEvent,
    rawBody: string,
    signature?: string,
  ): Promise<{ received: true; duplicate: boolean; outcome: OutcomeResult | 'unknown_payment' }> {
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
      // Peut arriver légitimement : l'opérateur notifie parfois avant que notre
      // propre transaction d'initiation ait été validée. On laisse la ligne en
      // RECEIVED pour que la réconciliation la reprenne.
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

    const outcome = await this.applyOutcome(payment.id, {
      status: event.status,
      failureCode: event.failureCode,
      failureReason: event.failureReason,
      providerFeeAmount: event.providerFeeAmount,
      source: 'webhook',
      rawPayload: event,
    });

    await this.prisma.webhookEvent.update({
      where: { id: record.id },
      data: {
        status: outcome === 'applied' ? 'PROCESSED' : 'IGNORED',
        paymentId: payment.id,
        processedAt: new Date(),
        error: null,
      },
    });

    return { received: true, duplicate: Boolean(existing), outcome };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Machine à états
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Applique un verdict d'opérateur.
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
            providerPayload:
              outcome.rawPayload === undefined ? undefined : toJson(outcome.rawPayload),
          },
        });

        if (outcome.status === 'SUCCEEDED') {
          await this.orders.markPaid(tx, current.orderId, now, outcome.providerFeeAmount ?? 0);
        }

        // Un échec ne touche PAS à la commande : elle reste en AWAITING_PAYMENT
        // et ses places restent réservées jusqu'à l'expiration, pour que
        // l'acheteur puisse réessayer avec un autre numéro ou un autre opérateur.
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
         * Elle tournait pourtant avec les valeurs par défaut de Prisma — 2 s pour
         * obtenir une connexion, 5 s pour finir — alors que la simple RÉSERVATION
         * disposait déjà de vingt secondes. L'incohérence a été révélée par le
         * test de vente flash : sur cinq cents acheteurs simultanés, 143 paiements
         * restaient en `PROCESSING` avec « Unable to start a transaction in the
         * given time », pendant que l'argent était bel et bien encaissé chez
         * l'opérateur.
         *
         * La réconciliation périodique les rattrape à la minute suivante — rien
         * n'est perdu — mais 143 acheteurs sur 200 voyaient « paiement en cours »
         * au lieu de leur billet, à l'entrée d'un concert. Attendre une connexion
         * vaut mieux qu'échouer.
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
   * Interroge l'opérateur sur un paiement en attente.
   *
   * C'est le filet contre le webhook perdu. Renvoie `true` si l'état a changé.
   */
  async pollProvider(paymentId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment || !payment.providerReference || !isPaymentPending(payment.status)) {
      return false;
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

      // L'expiration est décidée par NOUS, pas par l'opérateur : passé le délai
      // annoncé à l'acheteur, une demande toujours en attente est abandonnée.
      const expired =
        isPaymentPending(status.status) &&
        payment.expiresAt !== null &&
        payment.expiresAt.getTime() < Date.now();

      const outcome: PaymentOutcome = expired
        ? {
            status: 'EXPIRED',
            failureReason: "La demande n'a pas été validée à temps sur ton téléphone.",
            source: 'expiry',
          }
        : {
            status: status.status,
            failureCode: status.failureCode,
            failureReason: status.failureReason,
            source: 'poll',
            rawPayload: status.rawResponse,
          };

      if (!expired && status.status === payment.status) {
        return false;
      }

      const applied = await this.applyOutcome(paymentId, outcome);

      if (applied === 'applied' && outcome.source === 'poll' && outcome.status === 'SUCCEEDED') {
        // Le webhook ne nous est jamais parvenu : l'écart est consigné, il
        // alimente le KPI de fiabilité de l'opérateur.
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

      this.logger.warn({ err: error, paymentId }, "Interrogation de l'opérateur en échec");
      return false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

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
      status: PaymentStatus;
      amount: number;
      currency: string;
      payerPhone: string | null;
      expiresAt: Date | null;
      failureReason: string | null;
    },
    reference: string,
    instructions?: string,
  ): PaymentState {
    return {
      paymentId: payment.id,
      orderReference: reference,
      status: payment.status,
      provider: payment.providerCode as PaymentProviderCode,
      amount: payment.amount,
      currency: payment.currency,
      // Jamais le numéro complet : cet écran est souvent montré à quelqu'un
      // d'autre pour qu'il valide le paiement.
      maskedPayerPhone: payment.payerPhone ? maskPhone(payment.payerPhone) : '',
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      instructions: instructions ?? null,
      failureReason: payment.failureReason,
    };
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
