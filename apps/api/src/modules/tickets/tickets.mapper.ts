import type { Ticket as TicketContract } from '@nexakabi/contracts';
import { Prisma } from '../../generated/prisma/client';
import type { TicketSigningService } from './ticket-signing.service';

/**
 * Relations nécessaires pour représenter un billet.
 *
 * Tout est chargé d'un coup, et c'est délibéré : le billet doit être complet
 * dans un cache hors ligne. Un champ manquant obligerait le participant à
 * retrouver du réseau devant la porte — exactement ce que ce produit doit
 * éviter.
 */
export const ticketWithRelations = Prisma.validator<Prisma.TicketDefaultArgs>()({
  include: {
    ticketType: { select: { name: true } },
    order: { select: { reference: true } },
    event: {
      select: {
        id: true,
        slug: true,
        shortCode: true,
        title: true,
        startsAt: true,
        endsAt: true,
        doorsOpenAt: true,
        coverImageUrl: true,
        accessInstructions: true,
        venue: { select: { name: true, address: true } },
        city: { select: { name: true } },
      },
    },
  },
});

export type TicketWithRelations = Prisma.TicketGetPayload<typeof ticketWithRelations>;

export function toTicket(
  ticket: TicketWithRelations,
  signing: TicketSigningService,
): TicketContract {
  return {
    id: ticket.id,
    reference: ticket.reference,
    status: ticket.status,

    accessToken: ticket.accessToken,
    // Le jeton est reconstruit à la lecture : la signature est stockée, la
    // charge utile se recalcule. Deux copies d'une même vérité finiraient par
    // diverger.
    qrToken: signing.rebuildToken({
      ticketPublicId: ticket.publicId,
      eventShortCode: ticket.event.shortCode,
      qrExpiresAt: ticket.qrExpiresAt,
      signature: ticket.signature,
    }),
    qrExpiresAt: ticket.qrExpiresAt.toISOString(),

    attendeeName: ticket.attendeeName,
    ticketTypeName: ticket.ticketType.name,

    eventId: ticket.event.id,
    eventSlug: ticket.event.slug,
    eventTitle: ticket.event.title,
    eventStartsAt: ticket.event.startsAt.toISOString(),
    eventEndsAt: ticket.event.endsAt.toISOString(),
    eventDoorsOpenAt: ticket.event.doorsOpenAt?.toISOString() ?? null,
    eventVenueName: ticket.event.venue?.name ?? null,
    eventAddress: ticket.event.venue?.address ?? null,
    eventCityName: ticket.event.city?.name ?? null,
    eventCoverImageUrl: ticket.event.coverImageUrl,
    eventAccessInstructions: ticket.event.accessInstructions,

    orderReference: ticket.order.reference,
    issuedAt: ticket.issuedAt.toISOString(),
    usedAt: ticket.usedAt?.toISOString() ?? null,
  };
}
