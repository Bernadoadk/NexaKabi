import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  buildEventReviewMessage,
  canTransitionEvent,
  organizationLink,
  type PendingEvent,
  type ReviewEventInput,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { runInBackground } from '../../infra/scheduling/background';
import { AuditService } from '../audit/audit.service';
import { EventNotifierService } from '../notifications/event-notifier.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly notifications: NotificationsService,
    private readonly eventNotifier: EventNotifierService,
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
        createdById: true,
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

    await this.notifyOrganizer(
      {
        id: event.id,
        title: event.title,
        organizationId: event.organizationId,
        recipients: [event.organization.ownerId, event.createdById],
      },
      { approved: target === 'PUBLISHED', note: input.note },
    );

    // Validé par la modération, l'événement est en ligne : les participants
    // qui suivent l'organisation l'apprennent, comme pour une mise en ligne
    // directe.
    if (target === 'PUBLISHED') {
      runInBackground(`Annonce de la publication ${eventId}`, () =>
        this.eventNotifier.announcePublication(eventId),
      );
    }

    this.logger.log(`Événement ${eventId} → ${target}`);
  }

  /**
   * Prévient l'organisation de la décision.
   *
   * ── Qui : le propriétaire, et celui qui a soumis ──────────────────────────
   * Le propriétaire répond de l'organisation ; la personne qui a créé
   * l'événement est celle qui attend la réponse, et qui peut avoir un autre rôle.
   * Souvent, c'est la même : l'ensemble les réduit alors à un seul destinataire.
   *
   * ── Le même message, par plus de canaux ───────────────────────────────────
   * Cette décision ne partait que par WhatsApp ou SMS, hors du centre, faute de
   * type pour la porter. `EVENT_REVIEWED` la porte : elle garde son canal
   * critique (WhatsApp, SMS en secours) — l'organisateur l'attend — et gagne
   * l'appareil et le centre. Une seule diffusion : le type décide des canaux.
   *
   * Ne lève jamais : la décision est prise, et un destinataire injoignable ne doit
   * pas la faire échouer.
   */
  private async notifyOrganizer(
    event: { id: string; title: string; organizationId: string; recipients: readonly string[] },
    input: { approved: boolean; note?: string },
  ): Promise<void> {
    const message = buildEventReviewMessage({
      eventTitle: event.title,
      approved: input.approved,
      note: input.note,
    });

    // Un événement peut être refusé, corrigé, puis approuvé : chaque décision est
    // une annonce à part, d'où l'instant dans l'empreinte.
    const decidedAt = Date.now();

    for (const userId of new Set(event.recipients)) {
      try {
        await this.notifications.notify({
          userId,
          type: 'EVENT_REVIEWED',
          title: message.title,
          body: message.body,
          actionUrl: organizationLink(event.organizationId, `/pro/evenements/${event.id}`),
          actionLabel: input.approved ? "Voir l'événement" : "Corriger l'événement",
          eventId: event.id,
          dedupeKey: `reviewed:${event.id}:${input.approved ? 'approved' : 'rejected'}:${decidedAt}`,
        });
      } catch (error) {
        this.logger.error({ err: error }, `Annonce de la décision sur ${event.id} impossible`);
      }
    }
  }
}
