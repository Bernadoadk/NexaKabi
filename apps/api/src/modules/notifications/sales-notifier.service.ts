import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { buildSaleMessage, buildSoldOutMessage, organizationLink } from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { runInBackground } from '../../infra/scheduling/background';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { OrganizationAudienceService } from './organization-audience.service';

/** Une commande compte comme vente dès qu'elle est encaissée. */
const SOLD_STATUSES = ['PAID', 'COMPLETED'] as const;

/**
 * Catégories dont le stock restant compte encore : en vente, suspendues (elles
 * reprendront), ou déjà épuisées. Les brouillons et les catégories clôturées à la
 * main n'ont plus de stock à vendre.
 */
const STOCK_STATUSES = ['ON_SALE', 'PAUSED', 'SOLD_OUT'] as const;

/**
 * Fenêtre de regroupement des ventes d'un même événement.
 *
 * Dix minutes : assez pour qu'une ouverture de billetterie tienne en une ligne,
 * assez peu pour qu'une vente isolée ne soit pas annoncée avec une heure de
 * retard.
 */
export const SALES_WINDOW_MS = 10 * 60_000;

/**
 * Ce que l'organisation apprend de ses ventes.
 *
 * ── Un abonné à `order.paid`, comme l'e-mail du billet ──────────────────────
 * L'événement part après le commit de l'encaissement, par les deux chemins — le
 * paiement réel et l'inscription gratuite. S'y abonner plutôt que d'appeler ce
 * service depuis `markPaid` respecte la règle des diffusions sortantes : une
 * annonce de vente ne retient jamais l'encaissement qui l'a déclenchée, et son
 * échec ne l'annule pas.
 *
 * ── Une ligne par fenêtre, recalculée et non incrémentée ────────────────────
 * Le message ne se construit pas en ajoutant « +1 » à l'ancien : il se recalcule
 * à chaque vente depuis les commandes de la fenêtre. Une vente manquée — un
 * processus coupé — est rattrapée par la suivante, et rejouer l'événement ne
 * compte rien deux fois.
 *
 * ── Épuisement ──────────────────────────────────────────────────────────────
 * `Event.status = SOLD_OUT` n'est écrit nulle part : « complet » se calcule des
 * places restantes. Même calcul ici, après chaque vente. Annoncé une seule fois
 * par catégorie et par événement : l'empreinte est sans date.
 */
@Injectable()
export class SalesNotifierService {
  private readonly logger = new Logger(SalesNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audience: OrganizationAudienceService,
  ) {}

  @OnEvent('order.paid')
  onOrderPaid({ orderId }: { orderId: string }): void {
    runInBackground(`Annonce de la vente ${orderId}`, () => this.announce(orderId));
  }

  /** Annonce une commande encaissée aux membres qui gèrent les billets de l'événement. */
  async announce(orderId: string): Promise<{ notified: number }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paidAt: true,
        currency: true,
        eventId: true,
        event: { select: { id: true, title: true, organizationId: true } },
        items: { select: { ticketTypeId: true } },
      },
    });

    if (!order?.paidAt) return { notified: 0 };

    const { event } = order;

    const recipients = await this.audience.recipients(event.organizationId, 'ticket_type:manage', {
      eventId: event.id,
    });

    if (recipients.length === 0) return { notified: 0 };

    const stock = await this.readStock(event.id);

    // ── 1. La vente, regroupée avec celles de sa fenêtre ─────────────────────
    const bucket = Math.floor(order.paidAt.getTime() / SALES_WINDOW_MS);
    const from = new Date(bucket * SALES_WINDOW_MS);
    const to = new Date(from.getTime() + SALES_WINDOW_MS);

    const inWindow = await this.prisma.order.findMany({
      where: {
        eventId: event.id,
        status: { in: [...SOLD_STATUSES] },
        paidAt: { gte: from, lt: to },
      },
      select: {
        subtotalAmount: true,
        items: { select: { quantity: true, ticketType: { select: { name: true } } } },
      },
    });

    const tickets = inWindow.reduce(
      (total, sale) => total + sale.items.reduce((sum, item) => sum + item.quantity, 0),
      0,
    );
    const revenue = inWindow.reduce((total, sale) => total + sale.subtotalAmount, 0);

    // « 2 × Pass VIP » n'a de sens que pour une vente dont toutes les lignes
    // portent la même catégorie.
    const names = new Set(inWindow.flatMap((sale) => sale.items.map((i) => i.ticketType.name)));

    const message = buildSaleMessage({
      eventTitle: event.title,
      orders: inWindow.length,
      tickets,
      amountLabel: revenue > 0 ? formatMoney(revenue, order.currency) : null,
      ticketTypeName: names.size === 1 ? ([...names][0] ?? null) : null,
      remaining: stock.eventRemaining,
    });

    let notified = 0;

    for (const userId of recipients) {
      const result = await this.notifications.upsertSummary({
        userId,
        type: 'SALE_RECEIVED',
        title: message.title,
        body: message.body,
        actionUrl: organizationLink(
          event.organizationId,
          `/pro/evenements/${event.id}/statistiques`,
        ),
        actionLabel: 'Voir les ventes',
        eventId: event.id,
        dedupeKey: `sales:${event.id}:${bucket}`,
      });

      if (result.id) notified += 1;
    }

    // ── 2. L'épuisement, s'il vient d'avoir lieu ─────────────────────────────
    await this.announceSoldOut({
      eventId: event.id,
      eventTitle: event.title,
      organizationId: event.organizationId,
      recipients,
      stock,
      orderedTypeIds: new Set(order.items.map((item) => item.ticketTypeId)),
    });

    return { notified };
  }

  /**
   * Les places restantes, par catégorie et pour l'événement entier.
   *
   * Les réservations en cours comptent comme prises : la place que quelqu'un
   * est en train de payer n'est plus vendable — même règle que l'écran public
   * (`computeTicketAvailability`).
   */
  private async readStock(eventId: string): Promise<{
    eventRemaining: number | null;
    types: { id: string; name: string; remaining: number }[];
  }> {
    const types = await this.prisma.ticketType.findMany({
      where: { eventId, deletedAt: null, status: { in: [...STOCK_STATUSES] } },
      select: {
        id: true,
        name: true,
        quantityTotal: true,
        quantitySold: true,
        quantityReserved: true,
      },
    });

    const withRemaining = types.map((type) => ({
      id: type.id,
      name: type.name,
      remaining: Math.max(0, type.quantityTotal - type.quantitySold - type.quantityReserved),
    }));

    return {
      eventRemaining:
        withRemaining.length > 0
          ? withRemaining.reduce((total, type) => total + type.remaining, 0)
          : null,
      types: withRemaining,
    };
  }

  private async announceSoldOut(input: {
    eventId: string;
    eventTitle: string;
    organizationId: string;
    recipients: readonly string[];
    stock: Awaited<ReturnType<SalesNotifierService['readStock']>>;
    orderedTypeIds: ReadonlySet<string>;
  }): Promise<void> {
    const { stock } = input;

    // L'événement entier : c'est la nouvelle, et elle couvre les catégories.
    if (stock.eventRemaining === 0) {
      await this.send(input, {
        ticketTypeName: null,
        dedupeKey: `soldout:${input.eventId}`,
      });
      return;
    }

    // Une catégorie qui vient de partir, parmi celles que cette commande a prises.
    for (const type of stock.types) {
      if (type.remaining === 0 && input.orderedTypeIds.has(type.id)) {
        await this.send(input, {
          ticketTypeName: type.name,
          dedupeKey: `soldout:${input.eventId}:${type.id}`,
        });
      }
    }
  }

  private async send(
    input: {
      eventId: string;
      eventTitle: string;
      organizationId: string;
      recipients: readonly string[];
    },
    soldOut: { ticketTypeName: string | null; dedupeKey: string },
  ): Promise<void> {
    const message = buildSoldOutMessage({
      eventTitle: input.eventTitle,
      ticketTypeName: soldOut.ticketTypeName,
    });

    for (const userId of input.recipients) {
      try {
        await this.notifications.notify({
          userId,
          type: 'SOLD_OUT',
          title: message.title,
          body: message.body,
          actionUrl: organizationLink(input.organizationId, `/pro/evenements/${input.eventId}`),
          actionLabel: "Voir l'événement",
          eventId: input.eventId,
          dedupeKey: soldOut.dedupeKey,
        });
      } catch (error) {
        // Un destinataire en échec ne prive pas les autres de l'annonce.
        this.logger.error({ err: error }, `Annonce d'épuisement impossible pour ${userId}`);
      }
    }
  }
}
