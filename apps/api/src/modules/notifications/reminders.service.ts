import { Injectable, Logger } from '@nestjs/common';
import { REMINDER_OFFSETS_HOURS, buildReminderMessage } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { OutboundService } from './outbound.service';

/** Largeur de la fenêtre de balayage. Voir `sweep` pour le raisonnement. */
const WINDOW_MS = 3_600_000;

/**
 * Rappels d'événement.
 *
 * ── Les trois échéances, et pourquoi celles-là ──────────────────────────────
 *  · **J-7** pour s'organiser : demander un congé, prévenir quelqu'un, prévoir
 *    le transport depuis Porto-Novo ou Parakou.
 *  · **J-1** pour ne pas oublier — c'est le rappel qui sauve la place achetée
 *    trois mois plus tôt.
 *  · **H-3** pour partir à temps. La circulation de fin d'après-midi à Cotonou
 *    justifie ce troisième rappel à elle seule : un concert à 20 h se rate en
 *    partant à 19 h 30.
 *
 * ── Ce qui n'est PAS envoyé ─────────────────────────────────────────────────
 * Un rappel dont l'échéance est déjà passée au moment de l'achat. Quelqu'un qui
 * achète la veille ne reçoit pas « c'est dans une semaine » : le message serait
 * faux, et un message faux abîme la confiance dans tous les suivants.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly outbound: OutboundService,
  ) {}

  /**
   * Balaye les événements dont une échéance de rappel tombe maintenant.
   *
   * ── Pourquoi une fenêtre d'une heure ──────────────────────────────────────
   * Le balayage tourne périodiquement, jamais à la seconde exacte. Chercher
   * l'instant précis ne trouverait rien ; chercher « tout ce qui a dépassé
   * l'échéance » renverrait l'historique entier à chaque passage.
   *
   * Une heure correspond à la cadence prévue du planificateur. Un passage
   * manqué — redémarrage, incident — perd ce rappel-là : c'est assumé. Le
   * rattraper à contretemps serait pire que ne pas l'envoyer, et les deux
   * échéances suivantes restent.
   *
   * L'index unique sur `dedupeKey` couvre le cas inverse : deux passages
   * rapprochés, ou deux instances du serveur, ne produisent qu'un rappel.
   */
  async sweep(now = new Date()): Promise<{ sent: number }> {
    let sent = 0;

    for (const offsetHours of REMINDER_OFFSETS_HOURS) {
      const windowStart = new Date(now.getTime() + offsetHours * 3_600_000);
      const windowEnd = new Date(windowStart.getTime() + WINDOW_MS);

      const events = await this.prisma.event.findMany({
        where: {
          status: 'PUBLISHED',
          startsAt: { gte: windowStart, lt: windowEnd },
        },
        select: {
          id: true,
          title: true,
          slug: true,
          venue: { select: { name: true } },
        },
      });

      for (const event of events) {
        sent += await this.remindEvent(event, offsetHours);
      }
    }

    if (sent > 0) {
      this.logger.log(`${sent} rappel(s) envoyé(s)`);
    }

    return { sent };
  }

  /**
   * Rappelle un événement à tous ses porteurs de billet valide.
   *
   * Les billets annulés ou remboursés sont exclus : rappeler un événement à
   * quelqu'un qui vient d'être remboursé serait au mieux vexant.
   */
  private async remindEvent(
    event: { id: string; title: string; slug: string; venue: { name: string } | null },
    offsetHours: number,
  ): Promise<number> {
    const holders = await this.prisma.ticket.findMany({
      where: {
        eventId: event.id,
        status: { in: ['VALID'] },
        order: { status: { in: ['PAID', 'COMPLETED'] }, userId: { not: null } },
      },
      // Un participant qui a acheté quatre places ne doit recevoir qu'un
      // rappel, pas quatre.
      distinct: ['orderId'],
      select: { order: { select: { userId: true } } },
    });

    const recipients = new Set(
      holders.map((ticket) => ticket.order.userId).filter((id): id is string => id !== null),
    );

    const message = buildReminderMessage({
      eventTitle: event.title,
      offsetHours,
      venueName: event.venue?.name ?? null,
    });

    let sent = 0;

    for (const userId of recipients) {
      const result = await this.notifications.notify({
        userId,
        type: 'EVENT_REMINDER',
        title: message.title,
        body: message.body,
        actionUrl: '/mon-compte/billets',
        actionLabel: 'Voir mon billet',
        eventId: event.id,
        // Un couple événement + échéance ne produit qu'un rappel, pour toujours.
        dedupeKey: `reminder:${event.id}:${offsetHours}`,
      });

      if (result.created) sent += 1;
    }

    return sent;
  }

  /**
   * Passage périodique complet.
   *
   * Rappels d'abord, reprise des envois en souffrance ensuite — dans cet ordre,
   * pour qu'un rappel créé à l'instant et dont la diffusion a échoué soit repris
   * au passage SUIVANT, pas dans le même. Le reprendre immédiatement
   * réessaierait un opérateur qui vient de refuser.
   */
  async tick(): Promise<{ reminders: number; retried: number }> {
    const { sent } = await this.sweep();
    const { retried } = await this.outbound.retryPending();

    return { reminders: sent, retried };
  }
}
