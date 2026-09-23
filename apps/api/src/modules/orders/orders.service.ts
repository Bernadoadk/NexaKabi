import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  RESERVATION_TTL_MINUTES,
  computeFeeBreakdown,
  type BuyerDetailsInput,
  type ConfirmOrderInput,
  type CreateOrderInput,
  type Order,
} from '@nexakabi/contracts';
import { generateOrderReference } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import type { Prisma } from '../../generated/prisma/client';
import { orderWithRelations, toOrder, type OrderWithRelations } from './orders.mapper';
import { StockService } from './stock.service';
import { TicketsService } from '../tickets/tickets.service';
import { CommissionService } from '../finance/commission.service';
import { LedgerService } from '../finance/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface OrderContext {
  readonly userId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly referrer?: string;
}

export interface CreatedOrder {
  readonly order: Order;
  /** Jeton d'accès à cette commande, à conserver en cookie httpOnly. */
  readonly checkoutToken?: string;
}

/**
 * Commandes.
 *
 * Une commande naît au moment où l'acheteur choisit ses billets, avant même
 * d'avoir donné son nom : c'est ce qui permet de bloquer les places pendant
 * qu'il saisit ses coordonnées, et c'est aussi ce qui rend le panier
 * récupérable quand il ferme l'onglet en cours de paiement.
 *
 * Elle porte donc trois états successifs :
 *   DRAFT             → places réservées, acheteur inconnu
 *   AWAITING_PAYMENT  → coordonnées connues, conditions acceptées
 *   PAID              → encaissement confirmé par l'opérateur
 *
 * Voir docs/PROJECT_ANALYSIS.md §6.1.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly tickets: TicketsService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
    private readonly commission: CommissionService,
  ) {}

  /**
   * Crée une commande et réserve les places.
   *
   * Tout se joue dans une seule transaction : une commande sans réservation
   * vendrait des places déjà prises, une réservation sans commande bloquerait
   * des places pour personne.
   */
  async create(input: CreateOrderInput, context: OrderContext): Promise<OrderWithRelations> {
    const event = await this.prisma.event.findFirst({
      where: { id: input.eventId, deletedAt: null },
      include: {
        ticketTypes: { where: { deletedAt: null } },
        country: { select: { code: true, currency: true, isActive: true, name: true } },
      },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas ou n'est plus disponible.");
    }

    // Le pays de l'événement est le pays de PAIEMENT : il fixe la devise et,
    // plus loin, les moyens proposés. Un pays fermé entre-temps ferme la vente.
    if (!event.country.isActive) {
      throw new BadRequestException(
        `La billetterie n'est pas disponible pour ${event.country.name} pour le moment.`,
      );
    }

    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException(
        event.status === 'CANCELLED'
          ? 'Cet événement a été annulé.'
          : "La billetterie de cet événement n'est pas ouverte.",
      );
    }

    if (event.endsAt.getTime() < Date.now()) {
      throw new BadRequestException('Cet événement est terminé.');
    }

    const lines = this.resolveLines(input, event.ticketTypes);
    const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);

    if (event.maxTicketsPerOrder !== null && totalQuantity > event.maxTicketsPerOrder) {
      throw new BadRequestException(
        `Cet événement limite à ${event.maxTicketsPerOrder} billet(s) par commande.`,
      );
    }

    // La politique de commission se résout ICI et se fige sur la commande :
    // celle de l'organisation, sinon celle du pays, sinon celle de la
    // plateforme. Elle ne dépend jamais du moyen de paiement.
    const commission = await this.commission.resolve({
      organizationId: event.organizationId,
      countryCode: event.countryCode,
    });

    const breakdown = computeFeeBreakdown({
      lines: lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
      policy: commission.policy,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000);

    const order = await this.prisma.$transaction(
      async (tx) => {
        // Verrou d'abord, écritures ensuite : voir la note d'ordonnancement de
        // StockService. L'ordre inverse provoque un interblocage sous charge.
        await this.stock.lockAndVerify(tx, lines);

        const created = await this.insertWithUniqueReference(tx, {
          // Vides tant que l'étape « Coordonnées » n'est pas franchie. Une
          // contrainte en base interdit de dépasser DRAFT sans les renseigner.
          buyerName: '',
          buyerPhone: '',
          userId: context.userId,
          eventId: event.id,
          status: 'DRAFT',
          subtotalAmount: breakdown.subtotalAmount,
          discountAmount: breakdown.discountAmount,
          platformFeeAmount: breakdown.platformFeeAmount,
          buyerFeeAmount: breakdown.buyerFeeAmount,
          organizerFeeAmount: breakdown.organizerFeeAmount,
          totalAmount: breakdown.totalAmount,
          organizerNetAmount: breakdown.organizerNetAmount,
          currency: event.currency,
          countryCode: event.countryCode,
          commissionPolicyId: commission.id,
          expiresAt,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          referrer: context.referrer,
          items: {
            create: lines.map((line) => ({
              ticketTypeId: line.ticketTypeId,
              quantity: line.quantity,
              // Prix figé : une hausse de tarif pendant le paiement ne change
              // pas le montant annoncé à l'acheteur.
              unitPrice: line.unitPrice,
              subtotal: line.unitPrice * line.quantity,
            })),
          },
        });

        await this.stock.apply(tx, created.id, lines, expiresAt);

        return tx.order.findUniqueOrThrow({ ...orderWithRelations, where: { id: created.id } });
      },
      {
        /**
         * Une vente flash sérialise des centaines d'acheteurs sur la même
         * catégorie de billet. Les valeurs par défaut de Prisma — 2 s d'attente
         * pour obtenir une connexion — refusent alors la majorité des demandes
         * alors que les places existent. Mesuré sur 100 acheteurs simultanés :
         * 81 refus pour ce seul motif.
         */
        maxWait: 20_000,
        timeout: 15_000,
      },
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.orderCreated,
      entityType: 'order',
      entityId: order.id,
      actorUserId: context.userId,
      actorType: context.userId ? 'USER' : 'SYSTEM',
      changes: { reference: order.reference, totalAmount: order.totalAmount },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return order;
  }

  /**
   * Enregistre les coordonnées de l'acheteur.
   *
   * N'ouvre PAS le paiement : c'est la confirmation du récapitulatif qui le
   * fait. Idempotent — revenir en arrière pour corriger un chiffre du numéro
   * doit fonctionner, y compris après un échec de paiement.
   */
  async setBuyerDetails(reference: string, input: BuyerDetailsInput): Promise<OrderWithRelations> {
    const order = await this.requireOpenOrder(reference);

    if (order.event.requiresAttendeeName) {
      const expected = order.items.reduce((total, item) => total + item.quantity, 0);
      const provided = input.attendees?.length ?? 0;

      if (provided < expected) {
        throw new BadRequestException(
          `Cet événement exige un nom par billet : il en manque ${expected - provided}.`,
        );
      }
    }

    const attendeesByTicketType = groupAttendees(input);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          buyerName: input.buyerName,
          buyerPhone: input.buyerPhone,
          buyerEmail: input.buyerEmail ?? null,
        },
      });

      for (const item of order.items) {
        const names = attendeesByTicketType.get(item.ticketTypeId);

        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            // Toujours renseigné, même quand l'événement n'exige pas de nom :
            // le carnet du contrôleur n'a alors aucun cas nul à traiter.
            attendees: (names ?? Array.from({ length: item.quantity }, () => input.buyerName))
              .slice(0, item.quantity)
              .map((name) => ({ name })),
          },
        });
      }
    });

    return this.requireOrder(reference);
  }

  /**
   * Confirme le récapitulatif et ouvre le paiement.
   *
   * L'acceptation des conditions est horodatée ici, après que le montant a été
   * affiché : c'est la seule preuve qui ait une valeur.
   *
   * ── Commande gratuite : pas de détour par le paiement ────────────────────
   * `Payment` comme `LedgerEntry` interdisent un montant nul (contraintes
   * `payment_amount_positive` et la garde de `isValidLedgerAmount`) — par
   * construction, une commande à 0 FCFA ne peut donc JAMAIS atteindre `PAID`
   * en passant par `PaymentsService`. Sans ce cas particulier, l'écran de
   * paiement affichait « Payer 0 FCFA » et la tentative échouait toujours en
   * base : ce n'était pas une commande inatteignable, c'en était une cassée.
   * La confirmation du récapitulatif EST donc l'unique geste qui la conclut,
   * exactement comme le ferait une inscription gratuite ailleurs.
   */
  async confirm(reference: string, input: ConfirmOrderInput): Promise<OrderWithRelations> {
    const order = await this.requireOpenOrder(reference);

    if (order.buyerPhone === '' || order.buyerName === '') {
      throw new BadRequestException('Renseigne tes coordonnées avant de confirmer.');
    }

    const now = new Date();

    await this.prisma.$transaction(
      async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            whatsappOptIn: input.whatsappOptIn,
            termsAcceptedAt: now,
            status: 'AWAITING_PAYMENT',
          },
        });

        if (order.totalAmount === 0) {
          await this.markPaid(tx, order.id, now, 0);
        }
      },
      { maxWait: 20_000, timeout: 20_000 },
    );

    if (order.totalAmount === 0) {
      // Après le commit, jamais avant : `TicketEmailService` lit la commande
      // via une connexion séparée, et la verrait encore AWAITING_PAYMENT si
      // ceci partait depuis l'intérieur de la transaction ci-dessus.
      this.events.emit('order.paid', { orderId: order.id });
    }

    return this.requireOrder(reference);
  }

  /** Commande par référence, sans contrôle d'état. */
  async findByReference(reference: string): Promise<Order> {
    return toOrder(await this.requireOrder(reference));
  }

  /**
   * Historique d'un participant.
   *
   * Les brouillons sont exclus : un panier jamais confirmé n'est pas une
   * commande aux yeux de l'acheteur, et l'afficher créerait de la confusion.
   */
  async listForUser(userId: string): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      ...orderWithRelations,
      where: { userId, status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return orders.map(toOrder);
  }

  async findForUser(userId: string, reference: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      ...orderWithRelations,
      where: { reference, userId },
    });

    if (!order) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    return toOrder(order);
  }

  /**
   * Annule une commande non payée et libère ses places.
   *
   * Explicite plutôt qu'attendre l'expiration : une place rendue tout de suite
   * est une place revendable tout de suite.
   */
  async cancel(reference: string): Promise<Order> {
    const order = await this.requireOrder(reference);

    if (order.status === 'PAID' || order.status === 'COMPLETED') {
      throw new ConflictException(
        'Cette commande est déjà payée. Contacte le support pour un remboursement.',
      );
    }

    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
      return toOrder(order);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.stock.release(tx, order.id);
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.orderCancelled,
      entityType: 'order',
      entityId: order.id,
      actorType: 'USER',
    });

    return this.findByReference(reference);
  }

  /**
   * Marque une commande payée, dans la transaction du paiement.
   *
   * N'ouvre PAS de transaction : elle est appelée depuis celle qui confirme le
   * paiement. Le stock, la commande et le paiement basculent ensemble ou pas
   * du tout.
   */
  async markPaid(
    tx: Prisma.TransactionClient,
    orderId: string,
    paidAt: Date,
    providerFeeAmount: number,
  ): Promise<void> {
    await this.stock.confirm(tx, orderId);

    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paidAt,
        providerFeeAmount,
        // Les frais opérateur sont prélevés sur la recette de l'organisateur :
        // ils réduisent son net, jamais le montant payé par le participant.
        organizerNetAmount: { decrement: providerFeeAmount },
        // La commande est encaissée : la réservation n'a plus d'échéance.
        expiresAt: null,
      },
      select: {
        id: true,
        eventId: true,
        reference: true,
        buyerPhone: true,
        totalAmount: true,
        event: { select: { title: true } },
      },
    });

    const ticketCount = await tx.orderItem.aggregate({
      where: { orderId },
      _sum: { quantity: true },
    });

    await tx.event.update({
      where: { id: order.eventId },
      data: {
        salesCount: { increment: ticketCount._sum.quantity ?? 0 },
        revenueTotal: { increment: order.totalAmount },
      },
    });

    // Rattachement silencieux à un compte : l'acheteur retrouvera sa commande
    // en se connectant avec le numéro qu'il vient d'utiliser, sans avoir eu à
    // créer de compte avant d'acheter.
    const buyerId = await this.attachSilentAccount(tx, orderId, order.buyerPhone);

    // Les billets naissent ICI, dans la transaction qui encaisse. Les émettre
    // après — dans un job, sur un événement — ouvrirait une fenêtre où un
    // paiement confirmé n'aurait pas encore de billet. Cette fenêtre finit
    // toujours par se refermer sur quelqu'un, devant la porte.
    await this.tickets.issueForOrder(tx, orderId);

    // La recette est portée au grand livre dans la MÊME transaction : un
    // encaissement sans écriture donnerait un solde inférieur à ce qui a été
    // réellement encaissé, et personne ne saurait de combien.
    //
    // Une commande gratuite ne génère à l'inverse AUCUNE écriture : il n'y a
    // ni vente, ni commission, ni frais opérateur à consigner. `LedgerEntry`
    // interdit d'ailleurs les montants nuls, pour la même raison que
    // `Payment` — écrire quand même ferait échouer la transaction entière.
    if (order.totalAmount > 0) {
      await this.recordRevenue(tx, orderId, providerFeeAmount);
    }

    // La notification est ÉCRITE ici, avec le reste. Sa diffusion, elle, part
    // après le commit — annoncer un paiement confirmé avant que la transaction
    // aboutisse mentirait à l'acheteur une fois sur mille, et cette fois-là
    // serait impossible à rattraper.
    if (buyerId) {
      await this.notifications.notify(
        {
          userId: buyerId,
          type: 'PAYMENT_CONFIRMED',
          title: 'Paiement confirmé',
          body: `Ton billet pour « ${order.event.title} » est prêt. Il fonctionne sans réseau.`,
          actionUrl: '/mon-compte/billets',
          actionLabel: 'Voir mon billet',
          eventId: order.eventId,
          orderId: order.id,
          // Un webhook rejoué ne produit pas une seconde confirmation.
          dedupeKey: `paid:${order.id}`,
        },
        tx,
      );
    }
  }

  /**
   * Porte la recette d'une commande au grand livre.
   *
   * Trois écritures — vente, commission, frais opérateur — et leur répartition
   * entre part disponible et part bloquée, selon le palier de l'organisation.
   */
  private async recordRevenue(
    tx: Prisma.TransactionClient,
    orderId: string,
    providerFeeAmount: number,
  ): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        reference: true,
        totalAmount: true,
        platformFeeAmount: true,
        eventId: true,
        event: {
          select: {
            endsAt: true,
            organizationId: true,
            organization: {
              select: { verificationStatus: true, completedEventsCount: true },
            },
          },
        },
        payments: {
          where: { status: 'SUCCEEDED' },
          select: { id: true },
          take: 1,
        },
      },
    });

    await this.ledger.recordSale(tx, {
      organizationId: order.event.organizationId,
      eventId: order.eventId,
      orderId,
      paymentId: order.payments[0]?.id ?? '',
      orderReference: order.reference,
      grossAmount: order.totalAmount,
      platformFeeAmount: order.platformFeeAmount,
      providerFeeAmount,
      isVerified: order.event.organization.verificationStatus === 'VERIFIED',
      completedEventsCount: order.event.organization.completedEventsCount,
      eventEndsAt: order.event.endsAt,
    });
  }

  /**
   * Libère les commandes expirées.
   *
   * Appelée périodiquement. Sans elle, un panier abandonné retiendrait des
   * places indéfiniment et l'événement afficherait « complet » à tort.
   */
  async releaseExpired(now = new Date()): Promise<number> {
    const released = await this.stock.releaseExpired(now);

    if (released > 0) {
      this.events.emit('orders.expired', { count: released, at: now });
    }

    return released;
  }

  // ───────────────────────────────────────────────────────────────────────────

  /** Charge une commande ou échoue. */
  async requireOrder(reference: string): Promise<OrderWithRelations> {
    const order = await this.prisma.order.findUnique({
      ...orderWithRelations,
      where: { reference },
    });

    if (!order) {
      throw new NotFoundException("Cette commande n'existe pas.");
    }

    return order;
  }

  /** Charge une commande encore modifiable, ou explique pourquoi elle ne l'est plus. */
  private async requireOpenOrder(reference: string): Promise<OrderWithRelations> {
    const order = await this.requireOrder(reference);

    if (order.status === 'PAID' || order.status === 'COMPLETED') {
      throw new ConflictException('Cette commande est déjà payée.');
    }

    if (order.status === 'EXPIRED' || order.status === 'CANCELLED') {
      throw new ConflictException(
        'Cette commande a expiré et les places ont été remises en vente. Recommence ta sélection.',
      );
    }

    if (order.expiresAt !== null && order.expiresAt.getTime() < Date.now()) {
      throw new ConflictException(
        'Le délai de réservation est écoulé. Recommence ta sélection de billets.',
      );
    }

    return order;
  }

  /**
   * Contrôle chaque ligne et fige son prix.
   *
   * Le prix vient TOUJOURS de la base, jamais de la requête : accepter un prix
   * envoyé par le client reviendrait à laisser l'acheteur fixer son montant.
   */
  private resolveLines(
    input: CreateOrderInput,
    ticketTypes: readonly {
      id: string;
      name: string;
      price: number;
      status: string;
      visibility: string;
      minPerOrder: number;
      maxPerOrder: number | null;
      salesStartAt: Date | null;
      salesEndAt: Date | null;
    }[],
  ): { ticketTypeId: string; quantity: number; unitPrice: number }[] {
    const byId = new Map(ticketTypes.map((ticket) => [ticket.id, ticket]));
    const now = Date.now();
    const seen = new Set<string>();

    return input.lines.map((line) => {
      if (seen.has(line.ticketTypeId)) {
        throw new BadRequestException('Une catégorie de billet apparaît deux fois.');
      }
      seen.add(line.ticketTypeId);

      const ticket = byId.get(line.ticketTypeId);

      if (!ticket) {
        throw new BadRequestException("Cette catégorie de billet n'appartient pas à l'événement.");
      }

      if (ticket.status !== 'ON_SALE') {
        throw new BadRequestException(`« ${ticket.name} » n'est pas en vente.`);
      }

      if (ticket.salesStartAt !== null && ticket.salesStartAt.getTime() > now) {
        throw new BadRequestException(`La vente de « ${ticket.name} » n'a pas encore commencé.`);
      }

      if (ticket.salesEndAt !== null && ticket.salesEndAt.getTime() < now) {
        throw new BadRequestException(`La vente de « ${ticket.name} » est terminée.`);
      }

      if (line.quantity < ticket.minPerOrder) {
        throw new BadRequestException(
          `« ${ticket.name} » se prend par ${ticket.minPerOrder} au minimum.`,
        );
      }

      if (ticket.maxPerOrder !== null && line.quantity > ticket.maxPerOrder) {
        throw new BadRequestException(
          `« ${ticket.name} » est limité à ${ticket.maxPerOrder} par commande.`,
        );
      }

      return { ticketTypeId: ticket.id, quantity: line.quantity, unitPrice: ticket.price };
    });
  }

  /**
   * Insère la commande en régénérant sa référence en cas de collision.
   *
   * Six caractères hexadécimaux donnent 16,7 millions de combinaisons : la
   * collision est rare mais pas impossible, et l'unicité est garantie par
   * l'index, pas par le tirage.
   *
   * ── Pourquoi un point de sauvegarde ─────────────────────────────────────
   * Attraper la violation d'unicité ne suffit PAS à l'intérieur d'une
   * transaction PostgreSQL : dès qu'une commande échoue, la transaction entière
   * passe en état annulé et toute instruction suivante est refusée avec
   * `25P02`. Le réessai s'exécuterait donc dans une transaction déjà morte —
   * le filet aurait l'air d'exister sans rien rattraper.
   *
   * Le `SAVEPOINT` délimite chaque tentative : en cas de collision, on revient
   * au point de sauvegarde, la transaction redevient utilisable, et le tirage
   * suivant peut aboutir.
   */
  private async insertWithUniqueReference(
    tx: Prisma.TransactionClient,
    data: Omit<Prisma.OrderUncheckedCreateInput, 'reference'>,
  ): Promise<{ id: string; reference: string }> {
    const savepoint = 'nk_order_reference';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);

      try {
        const created = await tx.order.create({
          data: { ...data, reference: generateOrderReference() },
          select: { id: true, reference: true },
        });

        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
        return created;
      } catch (error) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);

        if (!isUniqueViolation(error) || attempt === 4) throw error;
        this.logger.warn('Collision de référence de commande, nouveau tirage');
      }
    }

    /* c8 ignore next */
    throw new ConflictException('Impossible de générer une référence de commande.');
  }

  /**
   * Rattache la commande à un compte, en le créant si besoin.
   *
   * Le numéro a servi à payer : il est vérifié de fait. Créer le compte
   * maintenant évite à l'acheteur de perdre ses billets, sans jamais lui avoir
   * imposé une inscription avant l'achat.
   */
  private async attachSilentAccount(
    tx: Prisma.TransactionClient,
    orderId: string,
    buyerPhone: string,
  ): Promise<string | null> {
    const existing = await tx.order.findUnique({
      where: { id: orderId },
      select: { userId: true, buyerName: true },
    });

    if (existing?.userId) return existing.userId;

    const user = await tx.user.findFirst({
      where: { phone: buyerPhone, deletedAt: null },
      select: { id: true, fullName: true },
    });

    if (user) {
      await tx.order.update({ where: { id: orderId }, data: { userId: user.id } });

      // Le compte existait sans nom : l'achat vient de le fournir.
      if (user.fullName === '' && existing?.buyerName) {
        await tx.user.update({ where: { id: user.id }, data: { fullName: existing.buyerName } });
      }
      return user.id;
    }

    const created = await tx.user.create({
      data: {
        phone: buyerPhone,
        fullName: existing?.buyerName ?? '',
        // UNVERIFIED : le numéro a payé, il n'a pas prouvé son identité par
        // un code. La connexion passera par l'OTP habituel.
        status: 'UNVERIFIED',
      },
      select: { id: true },
    });

    await tx.order.update({ where: { id: orderId }, data: { userId: created.id } });

    return created.id;
  }
}

/** Répartit les noms de participants par catégorie de billet. */
function groupAttendees(input: BuyerDetailsInput): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const attendee of input.attendees ?? []) {
    const names = grouped.get(attendee.ticketTypeId) ?? [];
    names.push(attendee.name);
    grouped.set(attendee.ticketTypeId, names);
  }

  return grouped;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
