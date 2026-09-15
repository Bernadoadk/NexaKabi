import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { canTransitionEvent, type PendingEvent, type ReviewEventInput } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboundService } from '../notifications/outbound.service';

/**
 * Revue des événements avant publication — écran M2.
 *
 * ── Ce que cette revue protège ────────────────────────────────────────────
 * Le PREMIER événement d'une organisation passe par un contrôle humain. C'est
 * la barrière la plus efficace contre les faux événements : elle coûte une
 * lecture de deux minutes, et un escroc n'atteint jamais le stade où il
 * encaisse. Une organisation qui a déjà publié n'y repasse plus.
 *
 * ── Pourquoi ce service a manqué, et ce que ça produisait ─────────────────
 * Les transitions `PENDING_REVIEW → PUBLISHED | REJECTED` étaient déclarées
 * dans les contrats, la publication savait mettre un événement en revue — mais
 * RIEN ne savait l'en sortir. Un organisateur qui créait sa première
 * organisation puis son premier événement restait bloqué définitivement :
 * l'événement partait en revue et personne au monde ne pouvait l'approuver.
 *
 * Le défaut ne se voyait sur aucun test, parce que le jeu de démonstration
 * insère ses événements directement en `PUBLISHED`. Il fallait parcourir l'app
 * comme un vrai organisateur pour tomber dessus.
 */
@Injectable()
export class EventModerationService {
  private readonly logger = new Logger(EventModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbound: OutboundService,
  ) {}

  /**
   * File des événements en attente.
   *
   * ── L'ordre : le plus proche d'abord ────────────────────────────────────
   * Un événement qui se tient dans trois jours et attend sa revue perd des
   * ventes à chaque heure. Un autre prévu dans six mois peut attendre demain.
   * L'ancienneté de la demande ne dit rien de son urgence ; la date de
   * l'événement, si.
   */
  async listPending(): Promise<PendingEvent[]> {
    const events = await this.prisma.event.findMany({
      where: { status: 'PENDING_REVIEW', deletedAt: null },
      orderBy: { startsAt: 'asc' },
      take: 100,
      select: {
        id: true,
        title: true,
        slug: true,
        startsAt: true,
        updatedAt: true,
        coverImageUrl: true,
        organizationId: true,
        organization: {
          select: {
            name: true,
            verificationStatus: true,
            _count: {
              select: {
                events: { where: { status: { in: ['PUBLISHED', 'SOLD_OUT', 'COMPLETED'] } } },
              },
            },
          },
        },
        city: { select: { name: true } },
        venue: { select: { name: true } },
        ticketTypes: {
          where: { deletedAt: null },
          select: { price: true },
        },
      },
    });

    return events.map((event) => {
      const prices = event.ticketTypes.map((type) => type.price);

      return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        startsAt: event.startsAt.toISOString(),
        submittedAt: event.updatedAt.toISOString(),
        organizationId: event.organizationId,
        organizationName: event.organization.name,
        organizationVerified: event.organization.verificationStatus === 'VERIFIED',
        cityName: event.city?.name ?? null,
        venueName: event.venue?.name ?? null,
        coverImageUrl: event.coverImageUrl,
        ticketTypeCount: prices.length,
        lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
        // Le cas le plus à risque, et celui que cette revue existe pour couvrir.
        isFirstEvent: event.organization._count.events === 0,
      };
    });
  }

  /** Un événement en revue, avec tout ce qu'il faut pour juger. */
  async getPending(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            verificationStatus: true,
            createdAt: true,
            owner: { select: { fullName: true, phone: true } },
          },
        },
        city: { select: { name: true } },
        venue: { select: { name: true, address: true } },
        category: { select: { name: true } },
        ticketTypes: {
          where: { deletedAt: null },
          select: { name: true, price: true, quantityTotal: true },
        },
      },
    });

    if (!event) throw new NotFoundException("Cet événement n'existe pas.");

    return event;
  }

  /**
   * Statue sur un événement.
   *
   * ── Pourquoi un refus ne détruit rien ──────────────────────────────────
   * `REJECTED` ramène l'événement à un état modifiable : l'organisateur
   * corrige et resoumet, sans tout ressaisir. Un refus qui supprimerait le
   * travail transformerait chaque erreur de forme en abandon.
   */
  async review(eventId: string, input: ReviewEventInput, userId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        status: true,
        organizationId: true,
        organization: { select: { ownerId: true } },
      },
    });

    if (!event) throw new NotFoundException("Cet événement n'existe pas.");

    const target = input.decision === 'APPROVE' ? 'PUBLISHED' : 'REJECTED';

    if (!canTransitionEvent(event.status, target)) {
      throw new ConflictException(
        `Un événement « ${event.status} » ne peut pas passer à « ${target} ».`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          status: target,
          publishedAt: target === 'PUBLISHED' ? new Date() : null,
          // Le motif du refus est conservé sur l'événement : l'organisateur le
          // relit en rouvrant son brouillon, longtemps après le SMS.
          cancellationReason: target === 'REJECTED' ? input.note : null,
        },
      });

      // Les billets entrent en vente avec l'événement. Les laisser en brouillon
      // publierait une page où l'on ne peut rien acheter.
      if (target === 'PUBLISHED') {
        await tx.ticketType.updateMany({
          where: { eventId, status: 'DRAFT', deletedAt: null },
          data: { status: 'ON_SALE' },
        });
      }
    });

    await this.audit.record({
      action: 'admin.event.reviewed',
      entityType: 'Event',
      entityId: eventId,
      actorUserId: userId,
      organizationId: event.organizationId,
      changes: { decision: input.decision, note: input.note },
    });

    await this.notifyOrganizer(event.organization.ownerId, {
      eventTitle: event.title,
      approved: target === 'PUBLISHED',
      note: input.note,
    });

    this.logger.log(`Événement ${eventId} → ${target}`);
  }

  /**
   * Prévient l'organisateur.
   *
   * Hors du centre de notifications, comme les décisions de vérification : ce
   * centre appartient au participant, et ses quatre types sont fermés.
   */
  private async notifyOrganizer(
    ownerId: string,
    input: { eventTitle: string; approved: boolean; note?: string },
  ): Promise<void> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { phone: true },
    });

    if (!owner) return;

    const text = input.approved
      ? `« ${input.eventTitle} » est en ligne. Partage ton lien : les ventes sont ouvertes.`
      : `« ${input.eventTitle} » n'a pas été publié. ${input.note ?? ''} Corrige et resoumets depuis ton espace.`;

    await this.outbound.sendDirect({ userId: ownerId, phone: owner.phone, text });
  }
}
