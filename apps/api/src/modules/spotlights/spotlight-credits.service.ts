import { Injectable } from '@nestjs/common';
import {
  SPOTLIGHT_CREDIT_VALIDITY_MONTHS,
  type SpotlightCredit,
  type SpotlightCreditReason,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Avoirs de mise en avant.
 *
 * ── Ce qu'est un avoir, et ce qu'il n'est pas ───────────────────────────────
 * La valeur de jours payés et non diffusés, rendue à l'organisation pour une
 * prochaine place — douze mois, jamais retirable. Ce n'est PAS de l'argent du
 * solde : il ne figure pas au grand livre, qui ne retrace que ce qui peut
 * sortir de la plateforme. C'est ce qui garde le client sans lui faire payer
 * un jour qu'il n'a pas eu, et ce qui le fait revenir.
 *
 * ── Pourquoi chaque usage est consigné ──────────────────────────────────────
 * Un avoir dépensé sur une place qui n'est finalement jamais réglée (délai
 * écoulé) ou qui est refusée doit revenir à l'identique — même montant, même
 * échéance. `SpotlightCreditUse` garde le lien ; `restore` le défait.
 */
@Injectable()
export class SpotlightCreditsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Avoirs encore utilisables, ceux qui expirent le plus tôt d'abord. */
  async list(organizationId: string, now = new Date()): Promise<SpotlightCredit[]> {
    const rows = await this.prisma.spotlightCredit.findMany({
      where: { organizationId, remaining: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
      include: { booking: { select: { reference: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      remaining: row.remaining,
      currency: row.currency,
      reason: row.reason,
      note: row.note,
      bookingReference: row.booking?.reference ?? null,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Total utilisable dans une devise. */
  async available(
    client: PrismaService | Prisma.TransactionClient,
    organizationId: string,
    currency: string,
    now = new Date(),
  ): Promise<number> {
    const result = await client.spotlightCredit.aggregate({
      where: { organizationId, currency, remaining: { gt: 0 }, expiresAt: { gt: now } },
      _sum: { remaining: true },
    });

    return result._sum.remaining ?? 0;
  }

  /**
   * Dépense jusqu'à `amount` d'avoir sur une place, les plus proches de
   * l'échéance d'abord. Rend le montant réellement couvert.
   *
   * À appeler dans la transaction qui crée la place, sous son verrou : deux
   * demandes simultanées ne dépensent pas le même avoir (verrou de ligne).
   */
  async consume(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      currency: string;
      amount: number;
      bookingId: string;
      now: Date;
    },
  ): Promise<number> {
    if (input.amount <= 0) return 0;

    const credits = await tx.$queryRaw<{ id: string; remaining: number }[]>`
      SELECT id, remaining
      FROM "spotlight_credit"
      WHERE "organizationId" = ${input.organizationId}
        AND currency = ${input.currency}
        AND remaining > 0
        AND "expiresAt" > ${input.now}
      ORDER BY "expiresAt" ASC
      FOR UPDATE
    `;

    let left = input.amount;

    for (const credit of credits) {
      if (left === 0) break;

      const used = Math.min(credit.remaining, left);

      await tx.spotlightCredit.update({
        where: { id: credit.id },
        data: { remaining: { decrement: used } },
      });

      await tx.spotlightCreditUse.create({
        data: { creditId: credit.id, bookingId: input.bookingId, amount: used },
      });

      left -= used;
    }

    return input.amount - left;
  }

  /**
   * Rend aux avoirs ce qu'une place y avait pris — même montant, même échéance.
   * Rend le total restitué. Sans effet la seconde fois.
   */
  async restore(tx: Prisma.TransactionClient, bookingId: string, now: Date): Promise<number> {
    const uses = await tx.spotlightCreditUse.findMany({
      where: { bookingId, reversedAt: null },
      select: { id: true, creditId: true, amount: true },
    });

    let restored = 0;

    for (const use of uses) {
      await tx.spotlightCredit.update({
        where: { id: use.creditId },
        data: { remaining: { increment: use.amount } },
      });

      await tx.spotlightCreditUse.update({
        where: { id: use.id },
        data: { reversedAt: now },
      });

      restored += use.amount;
    }

    return restored;
  }

  /** Émet un avoir, valable douze mois à compter d'aujourd'hui. */
  async issue(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      currency: string;
      amount: number;
      reason: SpotlightCreditReason;
      note?: string | null;
      bookingId?: string;
      grantedById?: string;
      now: Date;
    },
  ): Promise<void> {
    if (input.amount <= 0) return;

    const expiresAt = new Date(input.now);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + SPOTLIGHT_CREDIT_VALIDITY_MONTHS);

    await tx.spotlightCredit.create({
      data: {
        organizationId: input.organizationId,
        currency: input.currency,
        amount: input.amount,
        remaining: input.amount,
        reason: input.reason,
        note: input.note ?? null,
        bookingId: input.bookingId,
        grantedById: input.grantedById,
        expiresAt,
      },
    });
  }
}
