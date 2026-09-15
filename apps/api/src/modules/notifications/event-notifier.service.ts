import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Ce qui, dans un événement, mérite de réveiller un téléphone.
 *
 * ── Le critère : le participant se déplacerait-il pour rien ? ───────────────
 * Une date décalée, un lieu changé, une annulation — oui. Un titre reformulé,
 * une description enrichie, une photo remplacée — non, même si l'organisateur
 * y attache de l'importance.
 *
 * Cette liste est délibérément courte. Chaque ajout dilue la valeur des
 * suivantes : un participant qui reçoit trois notifications pour une
 * modification de texte n'ouvrira pas la quatrième, celle qui annonçait le
 * changement de salle.
 */
const SENSITIVE_FIELDS = ['startsAt', 'endsAt', 'venueId', 'cityId', 'onlineUrl'] as const;

type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

/**
 * Notifications liées à la vie d'un événement.
 *
 * Séparé de `NotificationsService`, qui ne connaît que des destinataires et des
 * messages. Ici vit la question métier : qui est concerné, et par quoi.
 */
@Injectable()
export class EventNotifierService {
  private readonly logger = new Logger(EventNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Prévient les porteurs de billet qu'une information a changé.
   *
   * `changed` est calculé par l'appelant en comparant l'avant et l'après : ce
   * service ne devine pas ce qui a bougé, il en tire les conséquences.
   */
  async announceChange(input: {
    eventId: string;
    eventTitle: string;
    changed: readonly SensitiveField[];
    /** Version, pour que deux modifications successives donnent deux annonces. */
    revision: string;
  }): Promise<{ notified: number }> {
    const relevant = input.changed.filter((field) =>
      (SENSITIVE_FIELDS as readonly string[]).includes(field),
    );

    if (relevant.length === 0) return { notified: 0 };

    const body = describeChange(relevant);

    return this.announce({
      eventId: input.eventId,
      title: `${input.eventTitle} — information modifiée`,
      body,
      actionUrl: `/evenements/${input.eventId}`,
      actionLabel: "Voir l'événement",
      dedupeKey: `changed:${input.eventId}:${input.revision}`,
    });
  }

  /**
   * Prévient les porteurs de billet qu'un événement est annulé.
   *
   * Le motif est repris tel quel : c'est l'organisateur qui doit s'expliquer,
   * pas nous à sa place. Le remboursement est annoncé dans le même message —
   * c'est la première question, et ne pas y répondre déclenche des appels au
   * support qui n'apprendront rien de plus.
   */
  async announceCancellation(input: {
    eventId: string;
    eventTitle: string;
    reason: string;
  }): Promise<{ notified: number }> {
    return this.announce({
      eventId: input.eventId,
      title: `${input.eventTitle} est annulé`,
      body: `${input.reason.trim()} Tu seras remboursé intégralement, frais compris, sur le numéro qui a payé.`,
      actionUrl: '/mon-compte/billets',
      actionLabel: 'Voir mes billets',
      // Une annulation n'arrive qu'une fois : pas de version dans l'empreinte.
      dedupeKey: `cancelled:${input.eventId}`,
    });
  }

  /**
   * Diffuse à tous les porteurs d'un billet valide.
   *
   * Les billets annulés sont exclus : quelqu'un déjà remboursé n'a rien à faire
   * d'un changement de salle.
   */
  private async announce(input: {
    eventId: string;
    title: string;
    body: string;
    actionUrl: string;
    actionLabel: string;
    dedupeKey: string;
  }): Promise<{ notified: number }> {
    const holders = await this.prisma.ticket.findMany({
      where: {
        eventId: input.eventId,
        status: { in: ['VALID', 'USED'] },
        order: { status: { in: ['PAID', 'COMPLETED'] }, userId: { not: null } },
      },
      distinct: ['orderId'],
      select: { order: { select: { userId: true } } },
    });

    const recipients = new Set(
      holders.map((ticket) => ticket.order.userId).filter((id): id is string => id !== null),
    );

    let notified = 0;

    for (const userId of recipients) {
      const result = await this.notifications.notify({
        userId,
        type: 'EVENT_UPDATED',
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel,
        eventId: input.eventId,
        dedupeKey: input.dedupeKey,
      });

      if (result.created) notified += 1;
    }

    if (notified > 0) {
      this.logger.log(`${notified} participant(s) prévenu(s) pour ${input.eventId}`);
    }

    return { notified };
  }
}

/**
 * Compare l'avant et l'après, et renvoie les champs sensibles qui ont bougé.
 *
 * Les dates sont comparées par leur valeur numérique : deux objets `Date`
 * distincts portant le même instant ne sont pas égaux par identité, et le
 * naïf `!==` déclencherait une notification à chaque enregistrement.
 */
export function diffSensitiveFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): SensitiveField[] {
  return SENSITIVE_FIELDS.filter((field) => {
    const previous = before[field];
    const next = after[field];

    if (previous instanceof Date && next instanceof Date) {
      return previous.getTime() !== next.getTime();
    }

    return previous !== next;
  });
}

/** Formule le changement en français, sans jargon de base de données. */
function describeChange(fields: readonly SensitiveField[]): string {
  const dateChanged = fields.includes('startsAt') || fields.includes('endsAt');
  const placeChanged =
    fields.includes('venueId') || fields.includes('cityId') || fields.includes('onlineUrl');

  if (dateChanged && placeChanged) {
    return 'La date et le lieu ont changé. Vérifie les nouvelles informations avant de te déplacer.';
  }

  if (dateChanged) {
    return 'La date a changé. Ton billet reste valable — vérifie le nouvel horaire.';
  }

  return 'Le lieu a changé. Ton billet reste valable — vérifie la nouvelle adresse.';
}
