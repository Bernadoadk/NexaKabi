import { Injectable, NotFoundException } from '@nestjs/common';
import type { EventStats, OrganizationStats } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Statistiques d'un événement.
 *
 * ── Trois chiffres, pas trente ──────────────────────────────────────────────
 * Combien vendu, combien encaissé, combien entré. Le prototype prévient : un
 * organisateur béninois n'a pas le temps d'explorer un tableau de bord ; il
 * regarde entre deux appels, souvent sur son téléphone, la veille de son
 * événement.
 *
 * Le détail par catégorie et la courbe des ventes viennent après, pour ceux qui
 * en veulent — jamais devant.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async forEvent(organizationId: string, eventId: string): Promise<EventStats> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
      select: {
        id: true,
        title: true,
        checkedInCount: true,
        ticketTypes: {
          where: { deletedAt: null },
          select: { id: true, name: true, price: true, quantityTotal: true, quantitySold: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, status: { in: ['VALID', 'USED'] } },
      select: {
        ticketTypeId: true,
        issuedAt: true,
        orderItem: { select: { unitPrice: true } },
      },
    });

    const byType = new Map(
      event.ticketTypes.map((type) => [
        type.id,
        {
          ticketTypeId: type.id,
          name: type.name,
          sold: 0,
          total: type.quantityTotal,
          grossAmount: 0,
        },
      ]),
    );

    /**
     * Ventes par jour.
     *
     * Regroupées sur la date d'ÉMISSION du billet, pas sur celle de la
     * commande : un panier créé la veille et payé le lendemain compte le jour
     * où l'argent est entré.
     */
    const byDay = new Map<string, { ticketCount: number; grossAmount: number }>();

    let grossAmount = 0;

    for (const ticket of tickets) {
      const entry = byType.get(ticket.ticketTypeId);
      const price = ticket.orderItem.unitPrice;

      if (entry) {
        entry.sold += 1;
        entry.grossAmount += price;
      }

      grossAmount += price;

      const day = ticket.issuedAt.toISOString().slice(0, 10);
      const dayEntry = byDay.get(day) ?? { ticketCount: 0, grossAmount: 0 };
      dayEntry.ticketCount += 1;
      dayEntry.grossAmount += price;
      byDay.set(day, dayEntry);
    }

    const netAmount = await this.netForEvent(eventId);
    const ticketsSold = tickets.length;

    return {
      eventId: event.id,
      eventTitle: event.title,
      ticketsSold,
      ticketsAvailable: event.ticketTypes.reduce(
        (total, type) => total + (type.quantityTotal - type.quantitySold),
        0,
      ),
      grossAmount,
      netAmount,
      checkedInCount: event.checkedInCount,
      /**
       * Taux de présence.
       *
       * `null` tant qu'aucune entrée n'est enregistrée : afficher « 0 % » la
       * veille d'un événement serait exact et parfaitement décourageant.
       */
      attendanceRate:
        event.checkedInCount === 0 || ticketsSold === 0
          ? null
          : Math.round((event.checkedInCount / ticketsSold) * 100),
      byTicketType: [...byType.values()],
      salesByDay: [...byDay.entries()]
        .map(([date, values]) => ({ date, ...values }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Statistiques consolidées de l'organisation, tous événements confondus.
   *
   * ── Pourquoi ce n'est pas N appels à `forEvent` ─────────────────────────
   * Une organisation qui a publié plusieurs dizaines d'événements ferait
   * autant d'allers-retours. Les agrégats sont donc calculés en base en deux
   * requêtes groupées, pas assemblés côté application événement par
   * événement.
   */
  async forOrganization(organizationId: string): Promise<OrganizationStats> {
    const events = await this.prisma.event.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, title: true, status: true, startsAt: true, checkedInCount: true },
      orderBy: { startsAt: 'desc' },
    });

    const eventIds = events.map((event) => event.id);

    const soldByEvent = eventIds.length
      ? await this.prisma.ticket.groupBy({
          by: ['eventId'],
          where: { eventId: { in: eventIds }, status: { in: ['VALID', 'USED'] } },
          _count: { _all: true },
        })
      : [];

    const soldMap = new Map(soldByEvent.map((row) => [row.eventId, row._count._all]));

    const byEvent = events.map((event) => ({
      eventId: event.id,
      title: event.title,
      status: event.status,
      startsAt: event.startsAt.toISOString(),
      ticketsSold: soldMap.get(event.id) ?? 0,
      checkedInCount: event.checkedInCount,
    }));

    const publishedEventsCount = events.filter(
      (event) => event.status === 'PUBLISHED' || event.status === 'SOLD_OUT',
    ).length;

    return {
      eventsCount: events.length,
      publishedEventsCount,
      ticketsSoldTotal: byEvent.reduce((total, event) => total + event.ticketsSold, 0),
      checkedInTotal: events.reduce((total, event) => total + event.checkedInCount, 0),
      byEvent,
      salesByDay: await this.salesByDayForOrganization(eventIds),
    };
  }

  /**
   * Ventes par jour, tous événements de l'organisation confondus.
   *
   * Même source que `forEvent` — le billet, pas l'écriture du grand livre —
   * pour que « billets vendus » veuille dire la même chose partout dans le
   * produit. Plafonné aux trente derniers jours d'activité : c'est une courbe
   * de tendance, pas un relevé exhaustif.
   */
  private async salesByDayForOrganization(
    eventIds: string[],
  ): Promise<{ date: string; ticketCount: number; grossAmount: number }[]> {
    if (eventIds.length === 0) return [];

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId: { in: eventIds }, status: { in: ['VALID', 'USED'] } },
      select: { issuedAt: true, orderItem: { select: { unitPrice: true } } },
      orderBy: { issuedAt: 'desc' },
      take: 5_000,
    });

    const byDay = new Map<string, { ticketCount: number; grossAmount: number }>();

    for (const ticket of tickets) {
      const day = ticket.issuedAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { ticketCount: 0, grossAmount: 0 };
      entry.ticketCount += 1;
      entry.grossAmount += ticket.orderItem.unitPrice;
      byDay.set(day, entry);
    }

    return [...byDay.entries()]
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }

  /** Recette nette de l'événement, lue au grand livre — jamais recalculée. */
  private async netForEvent(eventId: string): Promise<number> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { eventId, type: { in: ['SALE', 'PLATFORM_FEE', 'PROVIDER_FEE', 'REFUND'] } },
      select: { amount: true },
    });

    return entries.reduce((total, entry) => total + entry.amount, 0);
  }

  /**
   * Liste des participants (écran O6).
   *
   * ── Portée des coordonnées ──────────────────────────────────────────────
   * Le téléphone n'est renvoyé qu'aux rôles dont la portée est `full`. Un
   * contrôleur, lui, n'obtient que le nom et la référence : c'est exactement ce
   * que la matrice de permissions promet, et le promettre sans le tenir n'aurait
   * aucune valeur.
   */
  async attendees(
    organizationId: string,
    eventId: string,
    scope: 'full' | 'minimal' = 'full',
  ): Promise<
    {
      id: string;
      reference: string;
      attendeeName: string;
      attendeePhone: string | null;
      ticketTypeName: string;
      status: string;
      usedAt: string | null;
      orderReference: string;
    }[]
  > {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { reference: 'asc' },
      select: {
        id: true,
        reference: true,
        attendeeName: true,
        attendeePhone: true,
        status: true,
        usedAt: true,
        ticketType: { select: { name: true } },
        order: { select: { reference: true } },
      },
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      reference: ticket.reference,
      attendeeName: ticket.attendeeName,
      attendeePhone: scope === 'full' ? ticket.attendeePhone : null,
      ticketTypeName: ticket.ticketType.name,
      status: ticket.status,
      usedAt: ticket.usedAt?.toISOString() ?? null,
      orderReference: ticket.order.reference,
    }));
  }

  /**
   * Export des participants, au format CSV.
   *
   * ── Pourquoi un point-virgule et un BOM ─────────────────────────────────────
   * Excel en configuration française attend le point-virgule comme séparateur ;
   * avec une virgule, tout atterrit dans une seule colonne. Le BOM UTF-8 lui
   * fait reconnaître l'encodage — sans lui, « Yélé » devient « YÃ©lÃ© ».
   *
   * Deux détails idiots qui font toute la différence entre un fichier utilisable
   * et un fichier que l'organisateur renonce à ouvrir.
   */
  async exportAttendees(organizationId: string, eventId: string): Promise<string> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { reference: 'asc' },
      select: {
        reference: true,
        attendeeName: true,
        attendeePhone: true,
        attendeeEmail: true,
        status: true,
        usedAt: true,
        ticketType: { select: { name: true } },
        order: { select: { reference: true, paidAt: true } },
        checkIns: {
          where: { isEffective: true, revokedAt: null },
          select: { gate: true, scannedAt: true },
          take: 1,
        },
      },
    });

    const header = [
      'Référence billet',
      'Nom',
      'Téléphone',
      'E-mail',
      'Catégorie',
      'Statut',
      'Commande',
      'Payé le',
      'Entré le',
      'Porte',
    ];

    const rows = tickets.map((ticket) => [
      ticket.reference,
      ticket.attendeeName,
      ticket.attendeePhone ?? '',
      ticket.attendeeEmail ?? '',
      ticket.ticketType.name,
      ticket.status === 'USED' ? 'Entré' : ticket.status === 'VALID' ? 'Non entré' : 'Annulé',
      ticket.order.reference,
      ticket.order.paidAt?.toISOString() ?? '',
      ticket.checkIns[0]?.scannedAt.toISOString() ?? '',
      ticket.checkIns[0]?.gate ?? '',
    ]);

    return BOM + [header, ...rows].map(toCsvLine).join(LINE_BREAK);
  }
}

/**
 * Marque d'ordre des octets.
 *
 * Écrite par son code plutôt que par le caractère lui-même : un U+FEFF littéral
 * est invisible dans un éditeur, disparaît au premier copier-coller, et se fait
 * signaler comme « espace irrégulier » par les analyseurs. Nommée, elle dit ce
 * qu'elle fait — apprendre à Excel que le fichier est en UTF-8, sans quoi
 * « Yélé » s'affiche « YÃ©lÃ© ».
 */
const BOM = String.fromCharCode(0xfeff);

/** Fin de ligne CSV. Excel attend CRLF, y compris sous macOS. */
const LINE_BREAK = String.fromCharCode(13, 10);

/** Échappe une ligne CSV : guillemets doublés, champ cité s'il le faut. */
function toCsvLine(cells: readonly string[]): string {
  return cells
    .map((cell) => (/[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
    .join(';');
}
