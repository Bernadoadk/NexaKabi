import { Injectable } from '@nestjs/common';
import { spotlightRef, type SpotlightStats } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Commandes dont les billets comptent au bilan : payées, même partiellement remboursées. */
const COUNTED_ORDER_STATUSES = ['PAID', 'COMPLETED', 'PARTIALLY_REFUNDED'] as const;

export const EMPTY_SPOTLIGHT_STATS: SpotlightStats = { views: 0, clicks: 0, tickets: null };

/**
 * Bilan des mises en avant : vues, clics, billets.
 *
 * Partagé par la console et par l'espace organisateur — c'est le même chiffre
 * que l'équipe voit et que l'organisateur a payé pour obtenir. Les billets
 * sont ceux des commandes payées dont la provenance est `une-<id>`, posée par
 * le lien de la une et reprise à la commande.
 */
@Injectable()
export class SpotlightStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async forSpotlights(
    rows: ReadonlyArray<{ id: string; kind: 'EVENT' | 'EXTERNAL' }>,
  ): Promise<Map<string, SpotlightStats>> {
    const result = new Map<string, SpotlightStats>();
    if (rows.length === 0) return result;

    const ids = rows.map((row) => row.id);
    const refs = rows.filter((row) => row.kind === 'EVENT').map((row) => spotlightRef(row.id));

    const [counters, items] = await Promise.all([
      this.prisma.spotlightDailyStat.groupBy({
        by: ['spotlightId'],
        where: { spotlightId: { in: ids } },
        _sum: { views: true, clicks: true },
      }),
      refs.length > 0
        ? this.prisma.orderItem.findMany({
            where: {
              order: { referrer: { in: refs }, status: { in: [...COUNTED_ORDER_STATUSES] } },
            },
            select: { quantity: true, order: { select: { referrer: true } } },
          })
        : Promise.resolve([]),
    ]);

    const tickets = new Map<string, number>();
    for (const item of items) {
      const ref = item.order.referrer;
      if (ref) tickets.set(ref, (tickets.get(ref) ?? 0) + item.quantity);
    }

    for (const row of rows) {
      const counter = counters.find((entry) => entry.spotlightId === row.id);
      result.set(row.id, {
        views: counter?._sum.views ?? 0,
        clicks: counter?._sum.clicks ?? 0,
        tickets: row.kind === 'EVENT' ? (tickets.get(spotlightRef(row.id)) ?? 0) : null,
      });
    }

    return result;
  }
}
