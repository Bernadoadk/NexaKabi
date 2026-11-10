import { Injectable, Logger } from '@nestjs/common';
import { formatMoney } from '@nexakabi/utils';
import type { Prisma } from '../../generated/prisma/client';
import { LedgerService } from '../finance/ledger.service';

/**
 * Ce que devient une place à la une quand son paiement réussit chez le
 * prestataire.
 *
 * Appelé par `PaymentsService.applyOutcome`, DANS la transaction qui marque le
 * paiement réussi, sous le verrou du paiement : l'encaissement et ses
 * conséquences s'écrivent ensemble, ou pas du tout.
 *
 *  · La place attend son paiement → elle passe en validation (`paid`).
 *  · Elle n'attend plus rien — annulée, expirée, interrompue pendant que
 *    l'organisateur validait sur son téléphone → le montant encaissé est rendu
 *    à son solde, au franc près (`unfulfillable`). Une commande dans ce cas
 *    attend un remboursement manuel ; une place appartient à une organisation
 *    qui a un solde, et l'argent y revient tout seul.
 *
 * Les places retenues pendant le paiement le sont jusqu'à `holdExpiresAt` plus
 * un délai de grâce (voir `SpotlightBookingsService`) : un paiement validé à
 * la dernière minute arrive donc sur une place encore réservée, sans que la
 * capacité du jour ait pu être reprise entre-temps.
 */
@Injectable()
export class SpotlightBookingSettlement {
  private readonly logger = new Logger(SpotlightBookingSettlement.name);

  constructor(private readonly ledger: LedgerService) {}

  async settle(
    tx: Prisma.TransactionClient,
    input: { bookingId: string; paymentId: string; amount: number; now: Date },
  ): Promise<'paid' | 'unfulfillable'> {
    // Le verrou de la place : une annulation par l'organisateur et cet
    // encaissement ne se croisent pas.
    await tx.$queryRaw`SELECT id FROM "spotlight_booking" WHERE id = ${input.bookingId} FOR UPDATE`;

    const booking = await tx.spotlightBooking.findUniqueOrThrow({
      where: { id: input.bookingId },
      select: {
        id: true,
        reference: true,
        status: true,
        organizationId: true,
        eventId: true,
        currency: true,
        chargedAmount: true,
        refundedAmount: true,
        creditedAmount: true,
        totalAmount: true,
      },
    });

    if (booking.status === 'AWAITING_PAYMENT') {
      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: { status: 'PENDING_REVIEW', paidAt: input.now, holdExpiresAt: null },
      });

      return 'paid';
    }

    // Plus rien à régler : l'argent revient au solde. Le montant est celui que
    // le prestataire a encaissé — vérifié égal au montant dû par la lecture
    // de la transaction, avant d'arriver ici.
    const refundable = Math.min(
      input.amount,
      booking.totalAmount - booking.refundedAmount - booking.creditedAmount,
    );

    if (refundable > 0) {
      await this.ledger.write(tx, {
        organizationId: booking.organizationId,
        type: 'SPOTLIGHT_REFUND',
        amount: refundable,
        currency: booking.currency,
        balanceState: 'AVAILABLE',
        eventId: booking.eventId,
        paymentId: input.paymentId,
        spotlightBookingId: booking.id,
        description: `Paiement de la place ${booking.reference} arrivé après sa fin de réservation : ${formatMoney(refundable, booking.currency)} rendus au solde`,
      });

      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: { refundedAmount: { increment: refundable } },
      });
    }

    this.logger.warn(
      `Paiement ${input.paymentId} encaissé sur la place ${booking.reference} (${booking.status}) : ${refundable} rendus au solde`,
    );

    return 'unfulfillable';
  }
}
