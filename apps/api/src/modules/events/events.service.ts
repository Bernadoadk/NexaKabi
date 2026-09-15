import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canTransitionEvent,
  resolvePublicationTarget,
  type CreateEventInput,
  type EventDetail,
  type EventSummary,
  type TicketTypeInput,
  type UpdateEventInput,
} from '@nexakabi/contracts';
import { generateEventShortCode, slugify, uniqueSlug } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RefundsService } from '../finance/refunds.service';
import type { OrgContext } from '../organizations/guards/org-member.guard';
import { EventNotifierService, diffSensitiveFields } from '../notifications/event-notifier.service';
import { TicketsService } from '../tickets/tickets.service';
import {
  countTicketsSold,
  eventWithRelations,
  toOrganizerEventDetail,
  toOrganizerEventSummary,
} from './events.mapper';

/**
 * Événements, côté organisateur.
 *
 * L'assistant enregistre étape par étape : un brouillon incomplet doit pouvoir
 * être sauvegardé, sinon l'organisateur perd son travail en fermant l'onglet.
 * Les contrôles de cohérence ne s'appliquent donc qu'à la PUBLICATION.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventNotifier: EventNotifierService,
    private readonly refunds: RefundsService,
    private readonly tickets: TicketsService,
  ) {}

  async list(context: OrgContext): Promise<EventSummary[]> {
    const events = await this.prisma.event.findMany({
      ...eventWithRelations,
      where: { organizationId: context.organizationId, deletedAt: null },
      orderBy: [{ startsAt: 'desc' }],
    });

    return events.map((event) => toOrganizerEventSummary(event));
  }

  async findById(context: OrgContext, eventId: string): Promise<EventDetail> {
    const event = await this.prisma.event.findFirst({
      ...eventWithRelations,
      where: { id: eventId, organizationId: context.organizationId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    return toOrganizerEventDetail(event);
  }

  /**
   * Création d'un brouillon.
   *
   * Seul le titre est exigé : l'assistant complète le reste étape par étape, et
   * le brouillon est sauvegardé en continu.
   */
  async create(context: OrgContext, userId: string, input: CreateEventInput): Promise<EventDetail> {
    const category = input.categoryId
      ? await this.prisma.category.findUnique({ where: { id: input.categoryId } })
      : await this.prisma.category.findFirst({
          where: { isActive: true },
          orderBy: { position: 'asc' },
        });

    if (!category) {
      throw new BadRequestException('Aucune catégorie disponible. Contacte le support.');
    }

    const slug = await this.buildUniqueSlug(input.title);
    const shortCode = await this.buildUniqueShortCode();

    // Dates provisoires : l'étape 2 de l'assistant les remplacera. La contrainte
    // `endsAt > startsAt` interdit de les laisser vides.
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);

    const event = await this.prisma.event.create({
      ...eventWithRelations,
      data: {
        slug,
        shortCode,
        organizationId: context.organizationId,
        title: input.title,
        subtitle: input.subtitle,
        description: input.description,
        categoryId: category.id,
        subcategoryId: input.subcategoryId,
        startsAt,
        endsAt,
        status: 'DRAFT',
        draftStep: 1,
        createdById: userId,
      },
    });

    await this.audit.record({
      action: 'event.created',
      entityType: 'Event',
      entityId: event.id,
      organizationId: context.organizationId,
      actorUserId: userId,
    });

    return toOrganizerEventDetail(event);
  }

  async update(
    context: OrgContext,
    userId: string,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<EventDetail> {
    const existing = await this.requireEditable(context, eventId);

    const venueId = await this.resolveVenue(context, input, existing.venueId);

    /**
     * Plans du lieu : la liste reçue REMPLACE la précédente.
     *
     * C'est l'assistant qui tient la liste ; retirer un plan, c'est renvoyer
     * la liste sans lui. Une liste vide efface tout, une liste absente ne
     * touche à rien — les deux se distinguent par `undefined`, pas par la
     * longueur.
     */
    if (input.floorPlanUrls !== undefined) {
      await this.prisma.$transaction([
        this.prisma.eventImage.deleteMany({ where: { eventId, type: 'FLOOR_PLAN' } }),
        this.prisma.eventImage.createMany({
          data: input.floorPlanUrls.map((url, position) => ({
            eventId,
            url,
            type: 'FLOOR_PLAN' as const,
            position,
          })),
        }),
      ]);
    }

    const updated = await this.prisma.event.update({
      ...eventWithRelations,
      where: { id: eventId },
      data: {
        title: input.general?.title,
        subtitle: input.general?.subtitle,
        description: input.general?.description,
        categoryId: input.general?.categoryId,
        subcategoryId: input.general?.subcategoryId,

        startsAt: input.schedule?.startsAt,
        endsAt: input.schedule?.endsAt,
        doorsOpenAt: input.schedule?.doorsOpenAt,

        format: input.location?.format,
        cityId: input.location?.cityId,
        onlineUrl: input.location?.onlineUrl,
        onlinePlatform: input.location?.onlinePlatform,
        venueId,

        visibility: input.settings?.visibility,
        refundPolicy: input.settings?.refundPolicy,
        refundDeadlineDays: input.settings?.refundDeadlineDays,
        minimumAge: input.settings?.minimumAge,
        requiresAttendeeName: input.settings?.requiresAttendeeName,
        maxTicketsPerOrder: input.settings?.maxTicketsPerOrder,
        accessInstructions: input.settings?.accessInstructions,

        coverImageUrl: input.coverImageUrl,
        draftStep: input.draftStep,
      },
    });

    // Les porteurs de billet sont prévenus DES SEULS changements qui les
    // feraient se déplacer pour rien — date, lieu. Le reste, ils le verront en
    // ouvrant la page. Voir `EventNotifierService` pour le critère retenu.
    if (existing.status === 'PUBLISHED' || existing.status === 'SOLD_OUT') {
      const changed = diffSensitiveFields(
        existing as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );

      if (changed.length > 0) {
        await this.eventNotifier.announceChange({
          eventId: eventId,
          eventTitle: updated.title,
          changed,
          // La date de modification sert de version : deux corrections
          // successives donnent deux annonces, un double enregistrement du
          // même formulaire n'en donne qu'une.
          revision: updated.updatedAt.toISOString(),
        });
      }
    }

    void userId;
    return toOrganizerEventDetail(updated);
  }

  /**
   * Contrôles obligatoires avant publication.
   *
   * Renvoie la liste des manques plutôt que la première erreur : l'organisateur
   * doit voir tout ce qu'il lui reste à faire, pas le découvrir un par un.
   */
  async checkReadiness(context: OrgContext, eventId: string): Promise<string[]> {
    const event = await this.prisma.event.findFirst({
      ...eventWithRelations,
      where: { id: eventId, organizationId: context.organizationId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    const missing: string[] = [];

    if (event.title.trim().length < 3) missing.push('Donne un titre à ton événement');
    if (!event.description?.trim()) missing.push('Ajoute une description');
    if (event.startsAt.getTime() <= Date.now()) {
      missing.push('La date de début doit être à venir');
    }
    if (event.format !== 'ONLINE' && !event.cityId) missing.push('Indique la ville');
    if (event.format !== 'PHYSICAL' && !event.onlineUrl) {
      missing.push('Indique le lien de connexion');
    }

    const sellable = event.ticketTypes.filter((ticket) => ticket.deletedAt === null);
    if (sellable.length === 0) missing.push('Crée au moins une catégorie de billet');

    return missing;
  }

  /**
   * Publication.
   *
   * Deux chemins selon l'organisation : mise en ligne immédiate pour un
   * organisateur vérifié et établi, revue pour un premier événement. Voir
   * l'ambiguïté A5 dans docs/PROJECT_ANALYSIS.md.
   */
  async publish(
    context: OrgContext,
    userId: string,
    eventId: string,
  ): Promise<{ event: EventDetail; missing: string[] }> {
    const missing = await this.checkReadiness(context, eventId);

    if (missing.length > 0) {
      const event = await this.findById(context, eventId);
      return { event, missing };
    }

    const [existing, organization, publishedCount] = await Promise.all([
      this.prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: context.organizationId } }),
      this.prisma.event.count({
        where: {
          organizationId: context.organizationId,
          status: { in: ['PUBLISHED', 'SOLD_OUT', 'COMPLETED'] },
        },
      }),
    ]);

    const target = resolvePublicationTarget({
      isVerifiedOrganization: organization.verificationStatus === 'VERIFIED',
      publishedEventsCount: publishedCount,
    });

    if (!canTransitionEvent(existing.status, target)) {
      throw new BadRequestException(`Un événement « ${existing.status} » ne peut pas être publié.`);
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      // Les billets passent en vente en même temps que l'événement : publier un
      // événement dont les billets restent en brouillon n'aurait aucun sens.
      await tx.ticketType.updateMany({
        where: { eventId, status: 'DRAFT', deletedAt: null },
        data: { status: 'ON_SALE' },
      });

      return tx.event.update({
        ...eventWithRelations,
        where: { id: eventId },
        data: {
          status: target,
          publishedAt: target === 'PUBLISHED' ? now : null,
          draftStep: 8,
          draftData: undefined,
        },
      });
    });

    await this.audit.record({
      action: target === 'PUBLISHED' ? 'event.published' : 'event.submitted_for_review',
      entityType: 'Event',
      entityId: eventId,
      organizationId: context.organizationId,
      actorUserId: userId,
      changes: { from: existing.status, to: target },
    });

    return { event: toOrganizerEventDetail(updated), missing: [] };
  }

  /**
   * Dépublication — retour au brouillon.
   *
   * ── Quand c'est possible, et quand ça ne l'est plus ──────────────────────
   * Tant qu'aucun billet n'a été vendu, retirer un événement de la découverte
   * ne lèse personne : l'organisateur a publié trop tôt, il corrige et
   * republiera. Dès qu'un billet est vendu, quelqu'un a payé pour une date et
   * un lieu — l'événement ne se retire plus, il s'annule, avec remboursement.
   * La machine à états porte les deux transitions autorisées (voir
   * `EVENT_STATUS_TRANSITIONS`) ; la règle des ventes est vérifiée ici.
   *
   * Les billets repassent en brouillon avec l'événement, pour que la
   * publication suivante les remette en vente par le même chemin.
   */
  async unpublish(context: OrgContext, userId: string, eventId: string): Promise<EventDetail> {
    const existing = await this.prisma.event.findFirst({
      ...eventWithRelations,
      where: { id: eventId, organizationId: context.organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    if (!canTransitionEvent(existing.status, 'DRAFT')) {
      throw new BadRequestException(
        existing.status === 'DRAFT'
          ? 'Cet événement est déjà un brouillon.'
          : 'Cet événement ne peut plus être dépublié.',
      );
    }

    if (countTicketsSold(existing) > 0) {
      throw new BadRequestException(
        'Des billets ont déjà été vendus : cet événement ne peut plus être dépublié, seulement annulé — les participants sont alors remboursés.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.ticketType.updateMany({
        where: { eventId, status: 'ON_SALE', deletedAt: null },
        data: { status: 'DRAFT' },
      });

      return tx.event.update({
        ...eventWithRelations,
        where: { id: eventId },
        data: { status: 'DRAFT', publishedAt: null, draftStep: 8 },
      });
    });

    await this.audit.record({
      action: 'event.unpublished',
      entityType: 'Event',
      entityId: eventId,
      organizationId: context.organizationId,
      actorUserId: userId,
      changes: { from: existing.status, to: 'DRAFT' },
    });

    return toOrganizerEventDetail(updated);
  }

  /**
   * Suppression — logique, jamais physique.
   *
   * ── Ce qui peut être supprimé ────────────────────────────────────────────
   * Un événement qui n'a rien vendu : brouillon, refusé, en vérification, ou
   * même publié sans ventes. Un événement annulé ou terminé aussi — ses
   * billets ont déjà été traités, la ligne ne fait plus qu'encombrer la
   * liste. Ce qui NE peut PAS l'être : un événement en ligne qui a vendu.
   * Là, il faut annuler d'abord, pour que chacun soit remboursé et prévenu.
   *
   * La ligne reste en base avec `deletedAt` : le journal d'audit, les
   * commandes et les statistiques continuent d'y renvoyer.
   */
  async remove(context: OrgContext, userId: string, eventId: string): Promise<void> {
    const existing = await this.prisma.event.findFirst({
      ...eventWithRelations,
      where: { id: eventId, organizationId: context.organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    const live = existing.status === 'PUBLISHED' || existing.status === 'SOLD_OUT';

    if (live && countTicketsSold(existing) > 0) {
      throw new BadRequestException(
        'Des billets ont été vendus : annule d’abord l’événement pour que les participants soient remboursés, tu pourras le supprimer ensuite.',
      );
    }

    await this.prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      action: 'event.deleted',
      entityType: 'Event',
      entityId: eventId,
      organizationId: context.organizationId,
      actorUserId: userId,
      changes: { status: existing.status, title: existing.title },
    });
  }

  async cancel(
    context: OrgContext,
    userId: string,
    eventId: string,
    reason: string,
  ): Promise<EventDetail> {
    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: context.organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    if (!canTransitionEvent(existing.status, 'CANCELLED')) {
      throw new BadRequestException('Cet événement ne peut plus être annulé.');
    }

    const updated = await this.prisma.event.update({
      ...eventWithRelations,
      where: { id: eventId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
    });

    // Une annulation se dit tout de suite. C'est la notification qui justifie à
    // elle seule d'en avoir un système : quelqu'un qui a acheté trois mois plus
    // tôt n'ouvrira pas l'application avant de partir.
    //
    // Elle part AVANT les remboursements, et l'ordre n'est pas indifférent :
    // l'annonce s'adresse aux porteurs d'un billet encore valide, et le
    // remboursement annule précisément ces billets. Dans l'autre sens, elle ne
    // trouverait plus personne à prévenir.
    await this.eventNotifier.announceCancellation({
      eventId,
      eventTitle: updated.title,
      reason,
    });

    /**
     * Le remboursement que l'écran promet.
     *
     * ── Le trou que ceci bouche ──────────────────────────────────────────
     * L'assistant annonçait « déclenche son remboursement intégral », et le
     * service de remboursement existait — mais rien ne les reliait : une
     * annulation n'envoyait que la notification. Le participant lisait qu'il
     * serait remboursé, et ne l'était jamais.
     *
     * Commande par commande, frais compris, sans qu'un échec isolé bloque les
     * autres. Ce qui n'a pas pu être rendu automatiquement est consigné dans
     * l'audit, nominativement : c'est la liste du support.
     */
    const refunds = await this.refunds.refundCancelledEvent(eventId, userId);

    // Filet : plus aucun billet de cet événement ne doit passer à la porte,
    // même ceux dont le remboursement automatique a échoué.
    const ticketsCancelled = await this.tickets.cancelForEvent(eventId);

    await this.audit.record({
      action: 'event.cancelled',
      entityType: 'Event',
      entityId: eventId,
      organizationId: context.organizationId,
      actorUserId: userId,
      changes: {
        reason,
        refunded: refunds.refunded,
        freeOrdersClosed: refunds.closed,
        refundsFailed: refunds.failed,
        ticketsCancelled,
      },
    });

    return toOrganizerEventDetail(updated);
  }

  // ── Catégories de billets ─────────────────────────────────────────────────

  async addTicketType(
    context: OrgContext,
    userId: string,
    eventId: string,
    input: TicketTypeInput,
  ): Promise<EventDetail> {
    const event = await this.requireEditable(context, eventId);

    const count = await this.prisma.ticketType.count({ where: { eventId, deletedAt: null } });

    await this.prisma.ticketType.create({
      data: {
        eventId,
        name: input.name,
        description: input.description,
        price: input.price,
        quantityTotal: input.quantityTotal,
        minPerOrder: input.minPerOrder,
        maxPerOrder: input.maxPerOrder,
        salesStartAt: input.salesStartAt,
        salesEndAt: input.salesEndAt,
        visibility: input.visibility,
        accessCode: input.accessCode,
        position: count,
        // Une catégorie créée après publication est immédiatement en vente.
        status: event.status === 'DRAFT' ? 'DRAFT' : 'ON_SALE',
      },
    });

    await this.audit.record({
      action: 'ticket_type.created',
      entityType: 'TicketType',
      entityId: eventId,
      organizationId: context.organizationId,
      actorUserId: userId,
      changes: { name: input.name, price: input.price },
    });

    return this.findById(context, eventId);
  }

  async updateTicketType(
    context: OrgContext,
    userId: string,
    eventId: string,
    ticketTypeId: string,
    input: TicketTypeInput,
  ): Promise<EventDetail> {
    const ticket = await this.prisma.ticketType.findFirst({
      where: { id: ticketTypeId, eventId, deletedAt: null },
    });

    if (!ticket) {
      throw new NotFoundException("Cette catégorie de billet n'existe pas.");
    }

    // Réduire le quota sous le nombre déjà vendu invaliderait des billets payés.
    if (input.quantityTotal < ticket.quantitySold + ticket.quantityReserved) {
      throw new BadRequestException(
        `Impossible : ${ticket.quantitySold} billet(s) sont déjà vendus sur cette catégorie.`,
      );
    }

    await this.prisma.ticketType.update({
      where: { id: ticketTypeId },
      data: {
        name: input.name,
        description: input.description,
        price: input.price,
        quantityTotal: input.quantityTotal,
        minPerOrder: input.minPerOrder,
        maxPerOrder: input.maxPerOrder,
        salesStartAt: input.salesStartAt,
        salesEndAt: input.salesEndAt,
        visibility: input.visibility,
      },
    });

    await this.audit.record({
      action: 'ticket_type.updated',
      entityType: 'TicketType',
      entityId: ticketTypeId,
      organizationId: context.organizationId,
      actorUserId: userId,
      changes: { before: ticket.quantityTotal, after: input.quantityTotal },
    });

    return this.findById(context, eventId);
  }

  async removeTicketType(
    context: OrgContext,
    eventId: string,
    ticketTypeId: string,
  ): Promise<EventDetail> {
    const ticket = await this.prisma.ticketType.findFirst({
      where: { id: ticketTypeId, eventId, deletedAt: null },
    });

    if (!ticket) {
      throw new NotFoundException("Cette catégorie de billet n'existe pas.");
    }

    if (ticket.quantitySold > 0) {
      throw new BadRequestException(
        'Des billets ont déjà été vendus : cette catégorie peut être clôturée, pas supprimée.',
      );
    }

    await this.prisma.ticketType.update({
      where: { id: ticketTypeId },
      data: { deletedAt: new Date() },
    });

    return this.findById(context, eventId);
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────

  /** Un événement publié ou annulé ne se modifie plus librement. */
  private async requireEditable(context: OrgContext, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: context.organizationId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    if (event.status === 'CANCELLED' || event.status === 'ARCHIVED') {
      throw new ForbiddenException("Cet événement n'est plus modifiable.");
    }

    return event;
  }

  /** Crée ou réutilise le lieu, selon ce que l'assistant a saisi. */
  private async resolveVenue(
    context: OrgContext,
    input: UpdateEventInput,
    currentVenueId: string | null,
  ): Promise<string | undefined> {
    const location = input.location;

    if (!location?.venueName || !location.cityId) return undefined;

    /**
     * Les coordonnées ne sont écrites que si la recherche en a fourni.
     *
     * Un lieu resaisi à la main après avoir été localisé garde ses
     * coordonnées : elles ne deviennent fausses que si le NOM change pour un
     * autre lieu, et dans ce cas l'identifiant Google change aussi — c'est lui
     * qui décide de les remplacer.
     */
    const located =
      location.latitude !== undefined && location.longitude !== undefined
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            googlePlaceId: location.googlePlaceId ?? null,
          }
        : {};

    if (currentVenueId) {
      await this.prisma.venue.update({
        where: { id: currentVenueId },
        data: {
          name: location.venueName,
          address: location.address,
          cityId: location.cityId,
          ...located,
        },
      });
      return currentVenueId;
    }

    const venue = await this.prisma.venue.create({
      data: {
        name: location.venueName,
        address: location.address,
        cityId: location.cityId,
        organizationId: context.organizationId,
        ...located,
      },
    });

    return venue.id;
  }

  private async buildUniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'evenement';

    const taken = await this.prisma.event.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });

    return uniqueSlug(
      base,
      taken.map((row) => row.slug),
    );
  }

  /** Code court unique. L'espace est vaste ; une collision se retente. */
  private async buildUniqueShortCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = generateEventShortCode();
      const existing = await this.prisma.event.findUnique({
        where: { shortCode: candidate },
        select: { id: true },
      });

      if (!existing) return candidate;
    }

    throw new Error('Impossible de générer un code court unique après 10 tentatives.');
  }
}
