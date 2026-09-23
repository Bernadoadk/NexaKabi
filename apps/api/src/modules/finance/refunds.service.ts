import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { PaymentProviderRegistry } from '../payments/provider.registry';
import { TicketsService } from '../tickets/tickets.service';
import { LedgerService } from './ledger.service';
import type { PaymentProviderCode } from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';

export interface RefundRequest {
  readonly orderReference: string;
  readonly reason:
    'EVENT_CANCELLED' | 'CUSTOMER_REQUEST' | 'DUPLICATE_PAYMENT' | 'DISPUTE' | 'ADMIN';
  readonly note?: string;
  /** Montant partiel. Absent = remboursement intégral. */
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

/**
 * Remboursements.
 *
 * ── Ce qu'un remboursement doit garantir ────────────────────────────────────
 * Trois choses, dans le même mouvement : l'argent repart chez l'opérateur, les
 * billets cessent d'être valables, et le grand livre l'enregistre. Les
 * dissocier ouvrirait des fenêtres où un participant remboursé pourrait encore
 * entrer, ou bien où le solde de l'organisateur mentirait.
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

  /**
   * Rembourse une commande.
   *
   * L'appel à l'opérateur précède la transaction : si l'argent ne part pas,
   * rien ne doit être écrit. L'inverse — écrire puis appeler — laisserait un
   * remboursement comptabilisé que le participant n'aurait jamais reçu.
   */
  async refundOrder(request: RefundRequest, actorUserId: string): Promise<{ amount: number }> {
    const order = await this.prisma.order.findUnique({
      where: { reference: request.orderReference },
      include: {
        event: { select: { organizationId: true, title: true } },
        payments: {
          where: { status: 'SUCCEEDED' },
          orderBy: { confirmedAt: 'desc' },
          take: 1,
        },
        refunds: true,
      },
    });

    if (!order) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    if (order.status !== 'PAID' && order.status !== 'COMPLETED') {
      throw new ConflictException("Cette commande n'a pas été payée : il n'y a rien à rembourser.");
    }

    const payment = order.payments[0];

    if (!payment?.providerReference) {
      throw new ConflictException("Aucun paiement encaissé n'est rattaché à cette commande.");
    }

    const alreadyRefunded = order.refunds
      .filter((refund) => refund.status === 'COMPLETED' || refund.status === 'PROCESSING')
      .reduce((total, refund) => total + refund.amount, 0);

    const refundFees = request.refundFees ?? request.reason === 'EVENT_CANCELLED';

    // Le plafond dépend de ce qu'on accepte de rendre : avec les frais, c'est
    // tout ce que le participant a payé ; sans eux, le prix des billets seul.
    const refundable =
      (refundFees ? order.totalAmount : order.totalAmount - order.buyerFeeAmount) - alreadyRefunded;

    const amount = request.amount ?? refundable;

    if (amount <= 0 || amount > refundable) {
      throw new BadRequestException(
        refundable <= 0
          ? 'Cette commande a déjà été intégralement remboursée.'
          : `Le montant remboursable est de ${formatMoney(refundable, order.currency)} au maximum.`,
      );
    }

    const providerCode = payment.providerCode as PaymentProviderCode;

    if (!this.registry.has(providerCode)) {
      throw new ConflictException(
        `Le prestataire « ${providerCode} » qui a encaissé ce paiement n'est plus branché. ` +
          'Le remboursement doit être fait à la main.',
      );
    }

    const provider = this.registry.get(providerCode);
    const isFull = amount >= refundable;

    if (!provider.capabilities.refund) {
      throw new ConflictException(
        `Le prestataire « ${providerCode} » ne permet pas de rembourser automatiquement. ` +
          'Le remboursement doit être fait à la main.',
      );
    }

    if (!isFull && !provider.capabilities.partialRefund) {
      throw new ConflictException(
        `Le prestataire « ${providerCode} » ne sait rembourser qu'intégralement : ` +
          `demande ${formatMoney(refundable, order.currency)}, ou fais le remboursement partiel à la main.`,
      );
    }

    const result = await provider.refund({
      paymentId: payment.id,
      providerReference: payment.providerReference,
      amount,
      currency: order.currency,
      reason: request.reason,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId: order.id,
          amount,
          reason: request.reason,
          status: result.status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
          feesRefunded: refundFees,
          requestedById: actorUserId,
          providerReference: result.providerReference,
          note: request.note,
          completedAt: result.status === 'COMPLETED' ? new Date() : null,
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
        organizationId: order.event.organizationId,
        type: 'REFUND',
        amount: -amount,
        eventId: order.eventId,
        orderId: order.id,
        description: `Remboursement · ${order.reference}`,
      });

      // Les frais rendus au participant ne sont pas pris sur l'organisateur :
      // la plateforme restitue sa propre commission.
      if (refundFees && order.platformFeeAmount > 0) {
        await this.ledger.write(tx, {
          organizationId: order.event.organizationId,
          type: 'REFUND_FEE_REVERSAL',
          amount: order.platformFeeAmount,
          eventId: order.eventId,
          orderId: order.id,
          description: `Commission restituée · ${order.reference}`,
        });
      }
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.refundIssued,
      entityType: 'order',
      entityId: order.id,
      actorUserId,
      organizationId: order.event.organizationId,
      changes: { amount, reason: request.reason, refundFees, isFull },
    });

    this.logger.log(
      `Remboursement de ${formatMoney(amount, order.currency)} sur ${order.reference}`,
    );

    return { amount };
  }

  /**
   * Rembourse tous les acheteurs d'un événement annulé.
   *
   * ── Pourquoi commande par commande ──────────────────────────────────────
   * Un remboursement qui échoue — compte fermé, opérateur indisponible — ne
   * doit pas empêcher les autres. Sur un événement de six cents places, tout
   * annuler parce qu'un seul numéro pose problème serait absurde.
   *
   * Les échecs sont recensés et rendus à l'appelant, qui les traitera à la main.
   */
  async refundCancelledEvent(eventId: string, actorUserId: string): Promise<EventRefundReport> {
    const orders = await this.prisma.order.findMany({
      where: { eventId, status: { in: ['PAID', 'COMPLETED'] } },
      select: { id: true, reference: true, totalAmount: true },
    });

    let refunded = 0;
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

      try {
        await this.refundOrder(
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

        refunded += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Erreur inconnue';
        failed.push({ orderReference: order.reference, reason });

        // Consigné nominativement : c'est la liste que le support ouvrira pour
        // rembourser à la main, et elle ne doit pas dépendre d'un fichier de
        // journaux qui aura tourné entre-temps.
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

    if (failed.length > 0) {
      this.logger.error(
        `Annulation de ${eventId} : ${failed.length} remboursement(s) à traiter à la main`,
      );
    }

    return { refunded, closed, failed };
  }
}

export interface EventRefundReport {
  /** Commandes payantes remboursées, frais compris. */
  readonly refunded: number;
  /** Inscriptions gratuites closes : rien à rendre, billets annulés. */
  readonly closed: number;
  /** Commandes que l'opérateur n'a pas su rembourser : à traiter à la main. */
  readonly failed: { orderReference: string; reason: string }[];
}
