import { randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  resolveTicketTab,
  type Ticket,
  type TicketGroup,
  type TicketTab,
} from '@nexakabi/contracts';
import { buildTicketReference, qrExpiryFor, toBase64Url } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { TicketSigningService } from './ticket-signing.service';
import { ticketWithRelations, toTicket, type TicketWithRelations } from './tickets.mapper';

/** Attendus d'une ligne de commande : `[{ name }]`, un par place. */
interface AttendeeEntry {
  readonly name?: unknown;
}

/**
 * Billets.
 *
 * ── La règle d'or ───────────────────────────────────────────────────────────
 * Un billet naît EXCLUSIVEMENT dans la transaction qui confirme le paiement.
 * Jamais après, jamais dans un job, jamais sur un événement asynchrone. Un
 * encaissement sans billet est la panne la plus grave de ce produit : elle est
 * silencieuse, et elle se découvre à la porte de l'événement, quand plus rien
 * ne peut être corrigé.
 *
 * ── Un billet = un QR = une entrée ──────────────────────────────────────────
 * Deux places donnent deux enregistrements distincts, chacun avec son propre
 * identifiant public, sa propre signature et son propre jeton de partage.
 */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: TicketSigningService,
  ) {}

  /**
   * Émet les billets d'une commande encaissée.
   *
   * Idempotent : si des billets existent déjà pour cette commande, rien n'est
   * créé. Un webhook rejoué ne doit pas doubler les entrées, et l'index unique
   * sur la référence le garantit de toute façon en base.
   */
  async issueForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const existing = await tx.ticket.count({ where: { orderId } });

    if (existing > 0) {
      this.logger.warn(`Commande ${orderId} : ${existing} billet(s) déjà émis, émission ignorée`);
      return 0;
    }

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { include: { ticketType: { select: { name: true } } }, orderBy: { id: 'asc' } },
        event: { select: { id: true, shortCode: true, endsAt: true } },
      },
    });

    const { keyId } = await this.signing.ensureKey(tx, order.event.id);
    const qrExpiresAt = qrExpiryFor(order.event.endsAt);

    // Le suffixe est séquentiel SUR LA COMMANDE, pas sur la ligne : deux
    // catégories différentes ne repartent pas de 01, sinon deux billets de la
    // même commande porteraient la même référence.
    let sequence = 0;

    for (const item of order.items) {
      const names = attendeeNames(item.attendees, item.quantity, order.buyerName);

      for (let index = 0; index < item.quantity; index += 1) {
        sequence += 1;

        const publicId = randomToken();
        const reference = buildTicketReference(order.reference, sequence);

        const { signature } = this.signing.signTicket({
          eventId: order.event.id,
          keyId,
          ticketPublicId: publicId,
          eventShortCode: order.event.shortCode,
          qrExpiresAt,
        });

        await tx.ticket.create({
          data: {
            publicId,
            // Deux secrets de portées différentes, tirés séparément : le lien
            // partagé sur WhatsApp ne doit rien révéler du contenu du QR.
            accessToken: randomToken(),
            reference,
            orderId: order.id,
            orderItemId: item.id,
            ticketTypeId: item.ticketTypeId,
            eventId: order.event.id,
            attendeeName: names[index] ?? order.buyerName,
            attendeePhone: order.buyerPhone,
            attendeeEmail: order.buyerEmail,
            signature,
            signatureKeyId: keyId,
            qrExpiresAt,
          },
        });
      }
    }

    this.logger.log(`${sequence} billet(s) émis pour la commande ${order.reference}`);

    return sequence;
  }

  /** Billets d'un participant, regroupés par événement. */
  async listForUser(userId: string, tab?: TicketTab): Promise<TicketGroup[]> {
    const tickets = await this.prisma.ticket.findMany({
      ...ticketWithRelations,
      where: { order: { userId } },
      orderBy: [{ event: { startsAt: 'asc' } }, { reference: 'asc' }],
    });

    const now = new Date();

    const visible = tickets
      .map((ticket) => toTicket(ticket, this.signing))
      .filter((ticket) => tab === undefined || resolveTicketTab(ticket, now) === tab);

    return groupByEvent(visible, tickets);
  }

  /** Un billet du participant connecté. */
  async findForUser(userId: string, ticketId: string): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findFirst({
      ...ticketWithRelations,
      where: { id: ticketId, order: { userId } },
    });

    if (!ticket) {
      throw new NotFoundException('Ce billet n’existe pas, ou il ne t’appartient pas.');
    }

    return toTicket(ticket, this.signing);
  }

  /**
   * Billet accessible par son jeton public.
   *
   * C'est la porte d'entrée du lien reçu par WhatsApp : aucune session n'est
   * requise. Le prototype en fait une redondance délibérée — un billet
   * introuvable à la porte est un échec produit.
   */
  /**
   * Change le lien public d'un billet.
   *
   * ── Pourquoi cette possibilité manquait ─────────────────────────────────
   * `accessToken` ouvre la page du billet et son PDF, sans compte et sans
   * expiration. C'est la bonne conception — le porteur doit retrouver son
   * billet un an plus tard, depuis un lien WhatsApp, sur un téléphone qu'il a
   * changé entre-temps. Mais un lien transféré par erreur, à une conversation
   * de groupe par exemple, restait valable pour toujours et pour tout le monde.
   *
   * La rotation rend au porteur le contrôle de son propre partage : l'ancien
   * lien cesse immédiatement de fonctionner, le QR du billet, lui, ne change
   * pas — il est signé, et le réémettre invaliderait un billet déjà imprimé.
   */
  async rotateAccessToken(userId: string, ticketId: string): Promise<Ticket> {
    const existing = await this.prisma.ticket.findFirst({
      where: { id: ticketId, order: { userId } },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Ce billet n’existe pas, ou il ne t’appartient pas.');
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { accessToken: randomToken(), accessTokenRotatedAt: new Date() },
    });

    return this.findForUser(userId, ticketId);
  }

  async findByAccessToken(accessToken: string): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({
      ...ticketWithRelations,
      where: { accessToken },
    });

    if (!ticket) {
      throw new NotFoundException('Ce lien de billet n’est pas valide.');
    }

    return toTicket(ticket, this.signing);
  }

  /** Billets d'une commande, pour l'écran de confirmation. */
  async listForOrder(orderReference: string): Promise<Ticket[]> {
    const tickets = await this.prisma.ticket.findMany({
      ...ticketWithRelations,
      where: { order: { reference: orderReference } },
      orderBy: { reference: 'asc' },
    });

    return tickets.map((ticket) => toTicket(ticket, this.signing));
  }

  /**
   * Annule les billets d'une commande remboursée ou d'un événement annulé.
   *
   * Le billet n'est pas supprimé : le participant doit pouvoir constater
   * l'annulation, et le contrôleur doit pouvoir expliquer un refus à la porte.
   */
  async cancelForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const result = await tx.ticket.updateMany({
      where: { orderId, status: 'VALID' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    return result.count;
  }

  /**
   * Annule tout billet encore valide d'un événement annulé.
   *
   * Filet posé APRÈS les remboursements : ceux-ci annulent déjà les billets
   * des commandes qu'ils traitent. Restent celles qui n'ont pas pu être
   * remboursées automatiquement — l'opérateur a refusé, le compte est fermé.
   * Leur porteur sera remboursé à la main, mais son billet ne doit pas rester
   * lisible comme valable à la porte d'un événement qui n'a pas lieu.
   */
  async cancelForEvent(eventId: string): Promise<number> {
    const result = await this.prisma.ticket.updateMany({
      where: { eventId, status: 'VALID' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    return result.count;
  }
}

/** 16 octets aléatoires en base64url : 22 caractères, indevinables. */
function randomToken(): string {
  return toBase64Url(new Uint8Array(randomBytes(16)));
}

/**
 * Noms des participants d'une ligne de commande.
 *
 * Complète avec le nom de l'acheteur si l'événement n'exigeait pas de nom par
 * billet : le champ reste toujours renseigné, ce qui évite un cas nul dans le
 * carnet du contrôleur.
 */
function attendeeNames(raw: unknown, quantity: number, fallback: string): string[] {
  const entries = Array.isArray(raw) ? (raw as AttendeeEntry[]) : [];

  return Array.from({ length: quantity }, (_, index) => {
    const name = entries[index]?.name;
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : fallback;
  });
}

/** Regroupe les billets par événement, en conservant l'ordre chronologique. */
function groupByEvent(tickets: Ticket[], source: TicketWithRelations[]): TicketGroup[] {
  const covers = new Map(source.map((ticket) => [ticket.event.id, ticket.event.coverImageUrl]));
  const groups = new Map<string, TicketGroup>();

  for (const ticket of tickets) {
    const existing = groups.get(ticket.eventId);

    if (existing) {
      existing.tickets.push(ticket);
      continue;
    }

    groups.set(ticket.eventId, {
      eventId: ticket.eventId,
      eventSlug: ticket.eventSlug,
      eventTitle: ticket.eventTitle,
      eventStartsAt: ticket.eventStartsAt,
      eventVenueName: ticket.eventVenueName,
      eventCityName: ticket.eventCityName,
      eventCoverImageUrl: covers.get(ticket.eventId) ?? null,
      tickets: [ticket],
    });
  }

  return [...groups.values()];
}
