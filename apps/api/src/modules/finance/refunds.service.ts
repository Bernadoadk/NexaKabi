import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  REFUND_REASON_LABELS,
  getPaymentMethodDefinition,
  getPaymentProviderDefinition,
  type AdminRefund,
  type BalanceState,
  type PaymentProviderCode,
  type RefundPreview,
  type RefundQueue,
  type RefundReason,
  type RefundStatus,
} from '@nexakabi/contracts';
import { formatMoney, maskPhone } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { PaymentProviderRegistry } from '../payments/provider.registry';
import type { NormalizedRefundWebhook, RefundResult } from '../payments/providers/payment-provider';
import { TicketsService } from '../tickets/tickets.service';
import { LedgerService } from './ledger.service';

export interface RefundRequest {
  readonly orderReference: string;
  readonly reason: RefundReason;
  readonly note?: string;
  /** Montant partiel. Absent = tout ce qui reste à rendre. */
  readonly amount?: number;
  /**
   * Rembourser aussi les frais de service.
   *
   * `false` par défaut : le prototype l'affiche explicitement au récapitulatif.
   * Une annulation d'événement fait exception — le participant n'y est pour
   * rien, et lui retenir des frais serait indéfendable.
   */
  readonly refundFees?: boolean;
}

/** Où en est un remboursement, juste après un geste. */
export interface RefundOutcome {
  readonly refundId: string;
  readonly amount: number;
  readonly status: RefundStatus;
  /** Ce qui reste à faire, s'il reste quelque chose : refus, délai dépassé… */
  readonly failureReason: string | null;
}

/**
 * Marge prise sur le délai du prestataire. Son horloge démarre à SON
 * encaissement, qui précède de quelques secondes le nôtre ; une heure de
 * marge évite de lui envoyer une demande qu'il refusera à la dernière minute.
 */
const REFUND_WINDOW_MARGIN_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Remboursements interrogés par passage. Borne la charge sur le prestataire. */
const RECONCILE_BATCH_SIZE = 50;

/** Nombre de lignes rendues à la console par liste. */
const LIST_LIMIT = 200;

type RefundForExecution = Prisma.RefundGetPayload<{
  include: {
    payment: true;
    order: {
      select: { reference: true; currency: true; event: { select: { organizationId: true } } };
    };
  };
}>;

/**
 * Remboursements.
 *
 * ── Un remboursement est dû dès qu'il est décidé ────────────────────────────
 * La décision s'inscrit tout de suite, dans une seule transaction : le
 * remboursement, les écritures au grand livre, la commande, les billets. À
 * cet instant, l'argent quitte le solde de l'organisateur — qui ne peut donc
 * plus retirer ce qu'il doit rendre — et les billets cessent d'être valables.
 *
 * L'EXÉCUTION, elle, se suit à part, parce qu'elle ne dépend pas de nous :
 *   · par le prestataire quand il le peut — KPay rembourse intégralement, dans
 *     les sept jours, de façon asynchrone ;
 *   · à la main sinon — depuis son tableau de bord, ou par transfert vers le
 *     numéro qui a payé — puis consignée dans la console.
 * Tant qu'il n'est pas `COMPLETED`, un remboursement reste dans la file de
 * l'administration. Un refus du prestataire ne l'efface pas : il reste dû.
 *
 * ── Pourquoi l'appel au prestataire vient APRÈS l'écriture ─────────────────
 * L'ordre inverse — appeler puis écrire — laissait, si l'écriture échouait,
 * un participant remboursé sans trace chez nous. Ici, rien ne peut partir
 * sans être d'abord inscrit ; et la clé d'idempotence envoyée au prestataire
 * rend toute relance sans danger.
 *
 * ── Pourquoi les frais ne sont pas remboursés par défaut ────────────────────
 * Le service a été rendu : la place a été bloquée, le billet émis, l'opérateur
 * payé. Le prototype l'affiche noir sur blanc au récapitulatif, avant l'achat.
 * L'annulation d'événement est la seule exception, et elle est automatique.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly tickets: TicketsService,
    private readonly registry: PaymentProviderRegistry,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Décision
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Décide le remboursement d'une commande, puis le confie au prestataire
   * s'il le peut.
   */
  async refundOrder(request: RefundRequest, actorUserId: string): Promise<RefundOutcome> {
    const order = await this.prisma.order.findUnique({
      where: { reference: request.orderReference },
      include: {
        event: { select: { organizationId: true } },
        payments: {
          where: { status: 'SUCCEEDED' },
          orderBy: { confirmedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    // `REFUNDED` n'est pas exclu d'office : une commande remboursée SANS ses
    // frais doit encore les recevoir si l'événement est annulé ensuite. C'est
    // le calcul du restant dû, plus bas, qui dit s'il reste quelque chose.
    if (
      order.status !== 'PAID' &&
      order.status !== 'COMPLETED' &&
      order.status !== 'PARTIALLY_REFUNDED' &&
      order.status !== 'REFUNDED'
    ) {
      throw new ConflictException("Cette commande n'a pas été payée : il n'y a rien à rembourser.");
    }

    const payment = order.payments[0];

    if (!payment?.providerReference) {
      throw new ConflictException("Aucun paiement encaissé n'est rattaché à cette commande.");
    }

    const refundFees = request.refundFees ?? request.reason === 'EVENT_CANCELLED';
    const organizationId = order.event.organizationId;

    const refund = await this.prisma.$transaction(
      async (tx) => {
        // Sérialise les remboursements d'une même commande : deux
        // administrateurs, ou une annulation d'événement pendant un geste
        // manuel, ne doivent pas rendre deux fois le même argent.
        await tx.$queryRaw`SELECT id FROM "order" WHERE id = ${order.id} FOR UPDATE`;

        // Tout remboursement décidé compte, qu'il soit fait ou non : un refus
        // du prestataire ne rend pas l'argent à nouveau disponible.
        const prior = await tx.refund.aggregate({
          where: { orderId: order.id },
          _sum: { amount: true },
        });
        const alreadyRefunded = prior._sum.amount ?? 0;

        // Le plafond dépend de ce qu'on accepte de rendre : avec les frais,
        // tout ce que le participant a payé ; sans eux, le prix des billets.
        const refundable =
          (refundFees ? order.totalAmount : order.totalAmount - order.buyerFeeAmount) -
          alreadyRefunded;

        const amount = request.amount ?? refundable;

        if (amount <= 0 || amount > refundable) {
          throw new BadRequestException(
            refundable <= 0
              ? 'Cette commande a déjà été intégralement remboursée.'
              : `Le montant remboursable est de ${formatMoney(refundable, order.currency)} au maximum.`,
          );
        }

        const isFull = amount >= refundable;

        /**
         * Les écritures suivent la poche de la vente qu'elles compensent.
         *
         * Une vente encore bloquée — l'événement n'a pas eu lieu, cas de
         * toute annulation — se rembourse sur la part bloquée. Inscrire le
         * remboursement en « disponible » rendait le disponible négatif
         * pendant que la vente, elle, restait « en attente » : un solde juste
         * au total et faux dans le détail.
         */
        const sale = await tx.ledgerEntry.findFirst({
          where: { orderId: order.id, type: 'SALE' },
          select: { balanceState: true, availableAt: true },
        });
        const pocket = {
          balanceState: sale?.balanceState as BalanceState | undefined,
          availableAt: sale?.availableAt ?? null,
        };

        const created = await tx.refund.create({
          data: {
            paymentId: payment.id,
            orderId: order.id,
            amount,
            reason: request.reason,
            status: 'PENDING',
            feesRefunded: refundFees,
            requestedById: actorUserId,
            note: request.note,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { status: isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
        });

        // Un remboursement intégral invalide les billets. Un remboursement
        // PARTIEL ne le fait pas : le participant a payé une partie de sa place,
        // et lui refuser l'entrée serait un second tort.
        if (isFull) {
          await this.tickets.cancelForOrder(tx, order.id);
        }

        await this.ledger.write(tx, {
          organizationId,
          type: 'REFUND',
          amount: -amount,
          ...pocket,
          eventId: order.eventId,
          orderId: order.id,
          refundId: created.id,
          description: `Remboursement · ${order.reference}`,
        });

        // Les frais rendus au participant ne sont pas pris sur l'organisateur :
        // la plateforme restitue sa propre commission — une seule fois par
        // commande, même si elle est remboursée en plusieurs fois.
        if (refundFees && order.platformFeeAmount > 0) {
          const alreadyReversed = await tx.ledgerEntry.count({
            where: { orderId: order.id, type: 'REFUND_FEE_REVERSAL' },
          });

          if (alreadyReversed === 0) {
            await this.ledger.write(tx, {
              organizationId,
              type: 'REFUND_FEE_REVERSAL',
              amount: order.platformFeeAmount,
              ...pocket,
              eventId: order.eventId,
              orderId: order.id,
              refundId: created.id,
              description: `Commission restituée · ${order.reference}`,
            });
          }
        }

        return created;
      },
      { maxWait: 20_000, timeout: 20_000 },
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.refundRequested,
      entityType: 'refund',
      entityId: refund.id,
      actorUserId,
      organizationId,
      changes: {
        orderReference: order.reference,
        amount: refund.amount,
        reason: request.reason,
        refundFees,
      },
    });

    this.logger.log(
      `Remboursement de ${formatMoney(refund.amount, order.currency)} décidé sur ${order.reference}`,
    );

    return this.execute(refund.id, actorUserId);
  }

  /**
   * Rembourse tous les acheteurs d'un événement annulé.
   *
   * ── Pourquoi commande par commande ──────────────────────────────────────
   * Un remboursement qui échoue — compte fermé, délai dépassé chez le
   * prestataire — ne doit pas empêcher les autres. Sur un événement de six
   * cents places, tout arrêter parce qu'un seul numéro pose problème serait
   * absurde.
   *
   * Chaque commande payée reçoit son remboursement, décidé et inscrit : même
   * quand le prestataire ne peut pas s'en charger, l'argent quitte le solde de
   * l'organisateur et le remboursement attend dans la console.
   */
  async refundCancelledEvent(eventId: string, actorUserId: string): Promise<EventRefundReport> {
    // Les commandes déjà remboursées en sont : sans leurs frais, il leur reste
    // un dû, que l'annulation rend.
    const orders = await this.prisma.order.findMany({
      where: {
        eventId,
        status: { in: ['PAID', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      },
      select: {
        id: true,
        reference: true,
        totalAmount: true,
        refunds: { select: { amount: true } },
      },
    });

    let refunded = 0;
    let manual = 0;
    let closed = 0;
    const failed: { orderReference: string; reason: string }[] = [];

    for (const order of orders) {
      // Une inscription gratuite n'a rien à rendre : aucun paiement, aucune
      // écriture. Mais ses billets ne valent plus rien non plus, et la commande
      // doit le dire — un « payé » sur un événement annulé serait un mensonge
      // d'affichage dans l'historique du participant.
      if (order.totalAmount === 0) {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
          await this.tickets.cancelForOrder(tx, order.id);
        });

        closed += 1;
        continue;
      }

      // Tout est déjà rendu, frais compris : rien à décider de plus.
      const refundedSoFar = order.refunds.reduce((total, refund) => total + refund.amount, 0);
      if (order.totalAmount - refundedSoFar <= 0) continue;

      try {
        const outcome = await this.refundOrder(
          {
            orderReference: order.reference,
            reason: 'EVENT_CANCELLED',
            // Événement annulé : le participant n'y est pour rien, il récupère
            // tout, frais compris.
            refundFees: true,
            note: 'Événement annulé par l’organisateur',
          },
          actorUserId,
        );

        if (outcome.status === 'COMPLETED' || outcome.status === 'PROCESSING') {
          refunded += 1;
        } else {
          manual += 1;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Erreur inconnue';
        failed.push({ orderReference: order.reference, reason });

        // Consigné nominativement : rien n'a pu être inscrit pour cette
        // commande, et la liste ne doit pas dépendre d'un fichier de journaux
        // qui aura tourné entre-temps.
        await this.audit.record({
          action: AUDIT_ACTIONS.refundFailed,
          entityType: 'order',
          entityId: order.id,
          actorUserId,
          actorType: 'SYSTEM',
          changes: { eventId, reason },
        });
      }
    }

    if (manual + failed.length > 0) {
      this.logger.warn(
        `Annulation de ${eventId} : ${manual} remboursement(s) à faire à la main, ${failed.length} en erreur`,
      );
    }

    return { refunded, manual, closed, failed };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Exécution
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Relance un remboursement dû chez le prestataire — après un refus levé
   * depuis (wallet réalimenté), ou une réponse perdue.
   */
  async retry(refundId: string, actorUserId: string): Promise<RefundOutcome> {
    const refund = await this.loadForExecution(refundId);

    if (refund.status === 'PROCESSING') {
      throw new ConflictException(
        "Ce remboursement est déjà en cours chez l'opérateur : son issue arrivera d'elle-même.",
      );
    }

    if (refund.status === 'COMPLETED') {
      throw new ConflictException('Ce remboursement est déjà conclu.');
    }

    const blocker = this.automaticBlocker(refund.payment, refund.amount);

    if (blocker) {
      throw new ConflictException(blocker);
    }

    return this.attempt(refund, actorUserId);
  }

  /**
   * Consigne un remboursement fait hors API.
   *
   * Le geste qui conclut tout ce que le prestataire ne peut pas faire — délai
   * dépassé, remboursement partiel — et celui qui clôt un remboursement qu'il
   * n'a jamais conclu. L'argent est déjà sorti du grand livre à la décision :
   * rien n'y est écrit de plus.
   */
  async recordManual(
    refundId: string,
    input: { reference: string; note?: string },
    actorUserId: string,
  ): Promise<RefundOutcome> {
    const refund = await this.loadForExecution(refundId);

    if (refund.status === 'COMPLETED') {
      throw new ConflictException('Ce remboursement est déjà conclu.');
    }

    const outcome = await this.complete(refund, {
      providerReference: input.reference,
      manual: true,
      actorUserId,
      note: input.note,
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.refundRecorded,
      entityType: 'refund',
      entityId: refund.id,
      actorUserId,
      organizationId: refund.order.event.organizationId,
      changes: {
        reference: input.reference,
        previousStatus: refund.status,
        previousProviderReference: refund.providerReference,
      },
    });

    return outcome;
  }

  /**
   * Confie un remboursement décidé au prestataire, s'il le peut ; sinon, le
   * laisse dû avec la raison — c'est ce que lira l'administrateur.
   */
  private async execute(refundId: string, actorUserId?: string): Promise<RefundOutcome> {
    const refund = await this.loadForExecution(refundId);
    const blocker = this.automaticBlocker(refund.payment, refund.amount);

    if (blocker) {
      const updated = await this.prisma.refund.update({
        where: { id: refund.id },
        data: { failureReason: blocker },
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.refundManualRequired,
        entityType: 'refund',
        entityId: refund.id,
        actorUserId,
        organizationId: refund.order.event.organizationId,
        changes: { reason: blocker },
      });

      return toOutcome(updated);
    }

    return this.attempt(refund, actorUserId);
  }

  /**
   * Une demande au prestataire.
   *
   * ── La clé d'idempotence, et quand elle change ────────────────────────────
   * `<remboursement>-<génération>`. Rejouée telle quelle, elle ne rembourse
   * qu'une fois : c'est ce qui rend une relance sûre après une réponse
   * perdue, où l'on ne sait pas si l'argent est parti. Elle change quand le
   * prestataire a CRÉÉ une transaction qui a échoué — la même clé lui
   * renverrait cet échec au lieu de réessayer.
   */
  private async attempt(refund: RefundForExecution, actorUserId?: string): Promise<RefundOutcome> {
    const provider = this.registry.get(refund.payment.providerCode as PaymentProviderCode);
    const organizationId = refund.order.event.organizationId;

    const renew =
      refund.providerAttempt === 0 ||
      (refund.status === 'FAILED' && refund.providerReference !== null);
    const providerAttempt = renew ? refund.providerAttempt + 1 : refund.providerAttempt;

    await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        providerAttempt,
        lastAttemptAt: new Date(),
        ...(renew ? { providerReference: null } : {}),
        ...(actorUserId ? { processedById: actorUserId } : {}),
      },
    });

    let result: RefundResult;

    try {
      result = await provider.refund({
        refundKey: refundKey(refund.id, providerAttempt),
        paymentId: refund.paymentId,
        providerReference: refund.payment.providerReference ?? '',
        amount: refund.amount,
        currency: refund.order.currency,
        reason: `Nexa-Kabi · ${refund.order.reference} · ${REFUND_REASON_LABELS[refund.reason]}`,
        payerPhone: refund.payment.payerPhone ?? undefined,
      });
    } catch (error) {
      // Issue INCONNUE : l'argent est peut-être parti. On ne conclut rien, et
      // la même clé sera renvoyée — le prestataire ne remboursera pas deux fois.
      const message = error instanceof Error ? error.message : String(error);
      const failureReason =
        `Réponse de l'opérateur perdue (${message}). « Relancer » renvoie la même ` +
        'demande, sans risque de rembourser deux fois.';

      const updated = await this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'FAILED', failureReason },
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.refundFailed,
        entityType: 'refund',
        entityId: refund.id,
        actorUserId,
        actorType: actorUserId ? undefined : 'SYSTEM',
        organizationId,
        changes: { reason: failureReason, attempt: providerAttempt },
      });

      this.logger.warn(`Remboursement ${refund.id} : réponse du prestataire perdue — ${message}`);

      return toOutcome(updated);
    }

    if (result.status === 'COMPLETED') {
      return this.complete(refund, {
        providerReference: result.providerReference ?? null,
        actorUserId,
      });
    }

    if (result.status === 'PROCESSING') {
      const updated = await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: 'PROCESSING',
          providerReference: result.providerReference ?? null,
          failureReason: null,
        },
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.refundIssued,
        entityType: 'refund',
        entityId: refund.id,
        actorUserId,
        actorType: actorUserId ? undefined : 'SYSTEM',
        organizationId,
        changes: { providerReference: result.providerReference, attempt: providerAttempt },
      });

      return toOutcome(updated);
    }

    return this.fail(refund, {
      failureReason: result.failureReason ?? "L'opérateur a refusé le remboursement.",
      providerReference: result.providerReference ?? null,
      actorUserId,
    });
  }

  private async complete(
    refund: RefundForExecution,
    options: {
      providerReference?: string | null;
      manual?: boolean;
      actorUserId?: string;
      note?: string;
    },
  ): Promise<RefundOutcome> {
    const updated = await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        failureReason: null,
        manual: options.manual ?? false,
        ...(options.providerReference !== undefined
          ? { providerReference: options.providerReference }
          : {}),
        ...(options.actorUserId ? { processedById: options.actorUserId } : {}),
        ...(options.note ? { note: appendNote(refund.note, options.note) } : {}),
      },
    });

    if (!options.manual) {
      await this.audit.record({
        action: AUDIT_ACTIONS.refundCompleted,
        entityType: 'refund',
        entityId: refund.id,
        actorUserId: options.actorUserId,
        actorType: options.actorUserId ? undefined : 'SYSTEM',
        organizationId: refund.order.event.organizationId,
        changes: { providerReference: updated.providerReference },
      });
    }

    this.logger.log(
      `Remboursement ${refund.id} conclu (${formatMoney(refund.amount, refund.order.currency)} · ${refund.order.reference})`,
    );

    return toOutcome(updated);
  }

  /**
   * Refus du prestataire. Le remboursement reste DÛ : il change seulement de
   * mains, du prestataire à l'administrateur.
   */
  private async fail(
    refund: RefundForExecution,
    options: { failureReason: string; providerReference?: string | null; actorUserId?: string },
  ): Promise<RefundOutcome> {
    const updated = await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: 'FAILED',
        failureReason: options.failureReason,
        ...(options.providerReference !== undefined
          ? { providerReference: options.providerReference }
          : {}),
      },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.refundFailed,
      entityType: 'refund',
      entityId: refund.id,
      actorUserId: options.actorUserId,
      actorType: options.actorUserId ? undefined : 'SYSTEM',
      organizationId: refund.order.event.organizationId,
      changes: { reason: options.failureReason },
    });

    this.logger.warn(`Remboursement ${refund.id} refusé : ${options.failureReason}`);

    return toOutcome(updated);
  }

  /**
   * Pourquoi le prestataire ne peut pas se charger de ce remboursement.
   *
   * `null` : il le peut. Sinon, une phrase pour l'administrateur, qui dit
   * aussi quoi faire. Tranché AVANT l'appel : envoyer une demande qu'on sait
   * perdue ne ferait qu'ajouter un refus à la liste.
   */
  private automaticBlocker(
    payment: { providerCode: string; amount: number; confirmedAt: Date | null },
    amount: number,
  ): string | null {
    const code = payment.providerCode as PaymentProviderCode;
    const label = getPaymentProviderDefinition(code)?.label ?? code;

    if (!this.registry.has(code)) {
      return `${label}, qui a encaissé ce paiement, n'est plus branché : ce remboursement se fait à la main.`;
    }

    const provider = this.registry.get(code);

    if (!provider.capabilities.refund) {
      return `${label} ne rembourse pas par API : ce remboursement se fait à la main.`;
    }

    // Partiel au sens du PRESTATAIRE : moins que ce qu'il a encaissé. Rendre
    // le prix des billets sans les frais en est un, même si la commande est
    // entièrement remboursée de notre point de vue.
    if (amount < payment.amount && !provider.capabilities.partialRefund) {
      return `${label} ne rembourse que la totalité du paiement : un remboursement partiel se fait à la main.`;
    }

    const window = provider.capabilities.refundWindowDays;

    if (window !== null && payment.confirmedAt) {
      const deadline = payment.confirmedAt.getTime() + window * DAY_MS - REFUND_WINDOW_MARGIN_MS;

      if (Date.now() > deadline) {
        return `Le délai de ${label} (${window} jours après le paiement) est dépassé : ce remboursement se fait à la main.`;
      }
    }

    return null;
  }

  private async loadForExecution(refundId: string): Promise<RefundForExecution> {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        payment: true,
        order: {
          select: { reference: true, currency: true, event: { select: { organizationId: true } } },
        },
      },
    });

    if (!refund) {
      throw new NotFoundException("Ce remboursement n'existe pas.");
    }

    return refund;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Issue annoncée par le prestataire
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Notification de remboursement.
   *
   * Même idempotence que les encaissements : l'événement est consigné dans
   * `webhook_event`, un rejeu est reconnu. Un remboursement conclu n'est jamais
   * rouvert par un échec tardif.
   */
  async handleProviderEvent(
    providerCode: PaymentProviderCode,
    event: NormalizedRefundWebhook,
  ): Promise<{ duplicate: boolean; applied: boolean }> {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { providerCode_externalId: { providerCode, externalId: event.externalId } },
    });

    if (existing && existing.status !== 'RECEIVED' && existing.status !== 'FAILED') {
      return { duplicate: true, applied: false };
    }

    let record = existing;

    if (!record) {
      try {
        record = await this.prisma.webhookEvent.create({
          data: { providerCode, externalId: event.externalId, rawBody: JSON.stringify(event) },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return { duplicate: true, applied: false };
      }
    }

    const refund = await this.findRefundFor(providerCode, event);

    if (!refund) {
      // `FAILED` et non `RECEIVED` : la reprise des orphelins ne cherche que
      // des paiements. Un remboursement en cours reste de toute façon
      // interrogé chaque minute.
      await this.prisma.webhookEvent.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          error: `Aucun remboursement pour ${event.providerReference ?? event.merchantReference}`,
        },
      });

      this.logger.warn(
        `Notification de remboursement ${providerCode}/${event.externalId} sans remboursement`,
      );

      return { duplicate: Boolean(existing), applied: false };
    }

    const applied = await this.applyProviderOutcome(refund, event.status, {
      providerReference: event.providerReference,
      failureReason: event.failureReason,
    });

    await this.prisma.webhookEvent.update({
      where: { id: record.id },
      data: {
        status: applied ? 'PROCESSED' : 'IGNORED',
        paymentId: refund.paymentId,
        processedAt: new Date(),
        error: null,
      },
    });

    return { duplicate: Boolean(existing), applied };
  }

  /**
   * Interroge le prestataire sur les remboursements restés en cours.
   *
   * Le filet contre la notification perdue, comme pour les encaissements et
   * les versements. Appelée chaque minute par le planificateur des retraits.
   */
  async reconcileProcessing(): Promise<{ inspected: number; completed: number; failed: number }> {
    const refunds = await this.prisma.refund.findMany({
      where: { status: 'PROCESSING', providerReference: { not: null } },
      orderBy: { lastAttemptAt: 'asc' },
      take: RECONCILE_BATCH_SIZE,
      include: {
        payment: true,
        order: {
          select: { reference: true, currency: true, event: { select: { organizationId: true } } },
        },
      },
    });

    let completed = 0;
    let failed = 0;

    for (const refund of refunds) {
      const code = refund.payment.providerCode as PaymentProviderCode;
      if (!this.registry.has(code)) continue;

      const provider = this.registry.get(code);
      if (!provider.getRefundStatus || !refund.providerReference) continue;

      try {
        const status = await provider.getRefundStatus(refund.providerReference);
        if (status.status === 'PROCESSING') continue;

        const applied = await this.applyProviderOutcome(refund, status.status, {
          failureReason: status.failureReason,
        });

        if (applied && status.status === 'COMPLETED') completed += 1;
        if (applied && status.status === 'FAILED') failed += 1;
      } catch (error) {
        // Un prestataire injoignable ne doit pas faire échouer le passage : le
        // remboursement sera réinterrogé à la minute suivante.
        this.logger.warn(
          `Réconciliation du remboursement ${refund.id} impossible : ${
            error instanceof Error ? error.message : 'erreur inconnue'
          }`,
        );
      }
    }

    if (completed + failed > 0) {
      this.logger.log(
        `Réconciliation des remboursements : ${completed} conclu(s), ${failed} refusé(s) sur ${refunds.length} en cours`,
      );
    }

    return { inspected: refunds.length, completed, failed };
  }

  /** Applique une issue du prestataire. Renvoie `true` si l'état a changé. */
  private async applyProviderOutcome(
    refund: RefundForExecution,
    status: 'COMPLETED' | 'FAILED',
    details: { providerReference?: string; failureReason?: string },
  ): Promise<boolean> {
    if (status === 'COMPLETED') {
      if (refund.status === 'COMPLETED') {
        // Déjà conclu à la main, et le prestataire annonce l'avoir fait aussi :
        // le participant a peut-être été remboursé deux fois. Rien à défaire
        // automatiquement — mais quelqu'un doit le savoir.
        if (refund.manual) {
          await this.audit.record({
            action: AUDIT_ACTIONS.refundDuplicateSuspected,
            entityType: 'refund',
            entityId: refund.id,
            actorType: 'SYSTEM',
            organizationId: refund.order.event.organizationId,
            changes: {
              manualReference: refund.providerReference,
              providerReference: details.providerReference,
            },
          });

          this.logger.error(
            `Remboursement ${refund.id} conclu à la main ET par le prestataire : double remboursement possible`,
          );
        }

        return false;
      }

      await this.complete(refund, {
        providerReference: details.providerReference ?? refund.providerReference,
      });
      return true;
    }

    // Un échec n'a de sens que sur une demande en cours : il ne rouvre jamais
    // un remboursement conclu, et n'efface pas une relance plus récente.
    if (refund.status !== 'PROCESSING') {
      return false;
    }

    await this.fail(refund, {
      failureReason: details.failureReason ?? "L'opérateur a refusé le remboursement.",
      ...(details.providerReference ? { providerReference: details.providerReference } : {}),
    });

    return true;
  }

  /**
   * Retrouve le remboursement dont parle une notification.
   *
   * Par la référence du prestataire d'abord. À défaut, par notre clé de
   * tentative — mais seulement si c'est la tentative EN COURS : l'échec tardif
   * d'une demande déjà remplacée ne doit pas conclure la nouvelle.
   */
  private async findRefundFor(
    providerCode: PaymentProviderCode,
    event: NormalizedRefundWebhook,
  ): Promise<RefundForExecution | null> {
    const include = {
      payment: true,
      order: {
        select: { reference: true, currency: true, event: { select: { organizationId: true } } },
      },
    } as const;

    if (event.providerReference) {
      const byReference = await this.prisma.refund.findFirst({
        where: { providerReference: event.providerReference, payment: { providerCode } },
        include,
      });

      if (byReference) return byReference;
    }

    const key = event.merchantReference ? parseRefundKey(event.merchantReference) : null;

    if (key) {
      const byKey = await this.prisma.refund.findUnique({ where: { id: key.refundId }, include });

      if (byKey && byKey.providerAttempt === key.attempt) return byKey;
    }

    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Console
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Remboursements, file par file.
   *
   * `revealPhones` : le numéro du payeur en clair, pour qui peut déplacer
   * l'argent — c'est vers ce numéro qu'un remboursement manuel s'envoie. Même
   * alors, seulement tant qu'il reste quelque chose à faire.
   */
  async listAll(
    query: { queue?: RefundQueue },
    options: { revealPhones: boolean },
  ): Promise<AdminRefund[]> {
    const statuses: RefundStatus[] | undefined =
      query.queue === 'todo'
        ? ['PENDING', 'FAILED']
        : query.queue === 'processing'
          ? ['PROCESSING']
          : query.queue === 'done'
            ? ['COMPLETED']
            : undefined;

    const rows = await this.prisma.refund.findMany({
      where: statuses ? { status: { in: statuses } } : {},
      // Les plus anciens d'abord dans la file à traiter : un participant qui
      // attend depuis une semaine passe avant celui d'hier.
      orderBy: { createdAt: query.queue === 'todo' ? 'asc' : 'desc' },
      take: LIST_LIMIT,
      include: {
        payment: {
          select: {
            providerCode: true,
            methodCode: true,
            payerPhone: true,
            amount: true,
            confirmedAt: true,
          },
        },
        order: {
          select: {
            reference: true,
            buyerName: true,
            buyerPhone: true,
            currency: true,
            event: {
              select: { title: true, organization: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    return rows.map((row) => {
      const phone = row.payment.payerPhone ?? row.order.buyerPhone;
      const open = row.status !== 'COMPLETED';
      const reveal = options.revealPhones && open;
      const providerCode = row.payment.providerCode;

      return {
        id: row.id,
        orderId: row.orderId,
        orderReference: row.order.reference,
        eventTitle: row.order.event.title,
        organizationId: row.order.event.organization.id,
        organizationName: row.order.event.organization.name,
        buyerName: row.order.buyerName,
        payerPhone: reveal ? phone : safeMask(phone),
        payerPhoneMasked: !reveal,
        methodLabel:
          getPaymentMethodDefinition(row.payment.methodCode)?.label ?? row.payment.methodCode,
        amount: row.amount,
        currency: row.order.currency,
        feesRefunded: row.feesRefunded,
        reason: row.reason,
        status: row.status,
        manual: row.manual,
        automaticBlocker:
          row.status === 'PENDING' || row.status === 'FAILED'
            ? this.automaticBlocker(row.payment, row.amount)
            : null,
        providerLabel: getPaymentProviderDefinition(providerCode)?.label ?? providerCode,
        providerReference: row.providerReference,
        failureReason: row.failureReason,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
      };
    });
  }

  /** Ce qu'il reste à rendre sur une commande, avant de le décider. */
  async preview(orderReference: string): Promise<RefundPreview> {
    const order = await this.prisma.order.findUnique({
      where: { reference: orderReference.trim().toUpperCase() },
      include: {
        event: { select: { title: true, organization: { select: { name: true } } } },
        payments: {
          where: { status: 'SUCCEEDED' },
          orderBy: { confirmedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Aucune commande ne porte cette référence.');
    }

    const prior = await this.prisma.refund.aggregate({
      where: { orderId: order.id },
      _sum: { amount: true },
    });
    const alreadyRefunded = prior._sum.amount ?? 0;

    const refundableWithFees = Math.max(0, order.totalAmount - alreadyRefunded);
    const refundableWithoutFees = Math.max(
      0,
      order.totalAmount - order.buyerFeeAmount - alreadyRefunded,
    );

    const payment = order.payments[0];

    const blockerFor = (amount: number): string | null =>
      payment && amount > 0 ? this.automaticBlocker(payment, amount) : null;

    return {
      orderReference: order.reference,
      orderStatus: order.status,
      eventTitle: order.event.title,
      organizationName: order.event.organization.name,
      buyerName: order.buyerName,
      currency: order.currency,
      totalAmount: order.totalAmount,
      buyerFeeAmount: order.buyerFeeAmount,
      alreadyRefunded,
      refundableWithFees,
      refundableWithoutFees,
      paidAt: order.paidAt?.toISOString() ?? null,
      methodLabel: payment
        ? (getPaymentMethodDefinition(payment.methodCode)?.label ?? payment.methodCode)
        : null,
      automaticBlockerWithFees: blockerFor(refundableWithFees),
      automaticBlockerWithoutFees: blockerFor(refundableWithoutFees),
    };
  }
}

export interface EventRefundReport {
  /** Commandes confiées au prestataire — remboursées, ou en route. */
  readonly refunded: number;
  /** Commandes remboursables à la main seulement : inscrites, dans la console. */
  readonly manual: number;
  /** Inscriptions gratuites closes : rien à rendre, billets annulés. */
  readonly closed: number;
  /** Commandes pour lesquelles rien n'a pu être inscrit : à reprendre. */
  readonly failed: { orderReference: string; reason: string }[];
}

/** `<remboursement>-<génération>` : notre clé d'idempotence chez le prestataire. */
function refundKey(refundId: string, attempt: number): string {
  return `${refundId}-${attempt}`;
}

function parseRefundKey(key: string): { refundId: string; attempt: number } | null {
  const separator = key.lastIndexOf('-');
  if (separator <= 0) return null;

  const attempt = Number(key.slice(separator + 1));
  if (!Number.isInteger(attempt) || attempt <= 0) return null;

  return { refundId: key.slice(0, separator), attempt };
}

function toOutcome(refund: {
  id: string;
  amount: number;
  status: RefundStatus;
  failureReason: string | null;
}): RefundOutcome {
  return {
    refundId: refund.id,
    amount: refund.amount,
    status: refund.status,
    failureReason: refund.failureReason,
  };
}

function appendNote(existing: string | null, addition: string): string {
  return existing ? `${existing}\n${addition}` : addition;
}

/** Masque un numéro ; un numéro hors registre se réduit à ses quatre derniers chiffres. */
function safeMask(phone: string): string {
  try {
    return maskPhone(phone);
  } catch {
    return `•••• ${phone.slice(-4)}`;
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
