import type { Order as OrderContract } from '@nexakabi/contracts';
import { Prisma } from '../../generated/prisma/client';

/**
 * Relations minimales nécessaires pour représenter une commande.
 *
 * L'événement est chargé avec elle : le récapitulatif, l'écran d'attente et la
 * confirmation rappellent tous le titre, la date et le lieu. Les recharger
 * séparément multiplierait les allers-retours sur les écrans les plus sensibles
 * du produit.
 */
export const orderWithRelations = Prisma.validator<Prisma.OrderDefaultArgs>()({
  include: {
    items: {
      include: { ticketType: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
    },
    event: {
      select: {
        id: true,
        slug: true,
        title: true,
        startsAt: true,
        requiresAttendeeName: true,
        venue: { select: { name: true } },
        city: { select: { name: true } },
      },
    },
  },
});

export type OrderWithRelations = Prisma.OrderGetPayload<typeof orderWithRelations>;

export function toOrder(order: OrderWithRelations): OrderContract {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,

    eventId: order.event.id,
    eventSlug: order.event.slug,
    eventTitle: order.event.title,
    eventStartsAt: order.event.startsAt.toISOString(),
    eventVenueName: order.event.venue?.name ?? null,
    eventCityName: order.event.city?.name ?? null,

    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone,
    buyerEmail: order.buyerEmail,

    items: order.items.map((item) => ({
      id: item.id,
      ticketTypeId: item.ticketTypeId,
      ticketTypeName: item.ticketType.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),

    subtotalAmount: order.subtotalAmount,
    discountAmount: order.discountAmount,
    buyerFeeAmount: order.buyerFeeAmount,
    totalAmount: order.totalAmount,
    currency: order.currency,
    countryCode: order.countryCode,

    expiresAt: order.expiresAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),

    requiresAttendeeName: order.event.requiresAttendeeName,
  };
}
