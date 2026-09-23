import { Injectable } from '@nestjs/common';
import { DEFAULT_COMMISSION_POLICY, type CommissionPolicy } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { CommissionPolicy as CommissionPolicyRow } from '../../generated/prisma/client';

/** Une politique résolue, avec l'identifiant de la ligne qui l'a fournie. */
export interface ResolvedCommissionPolicy {
  readonly id: string | null;
  readonly policy: CommissionPolicy;
}

/**
 * Politique de commission applicable.
 *
 * ── La plus spécifique l'emporte ────────────────────────────────────────────
 *   1. une politique propre à l'ORGANISATION (négociée, promotionnelle) ;
 *   2. sinon celle du PAYS de l'événement ;
 *   3. sinon celle de la PLATEFORME (ni pays, ni organisation) ;
 *   4. sinon, si la base n'en porte aucune, la constante `DEFAULT_COMMISSION_POLICY`
 *      — le comportement d'avant, jamais un plantage.
 *
 * Une politique fermée (`isActive = false`) ou hors de sa fenêtre de validité
 * n'est pas retenue. Le résultat est FIGÉ sur la commande : la modifier ensuite
 * ne réécrit aucune vente passée.
 *
 * Aucune politique ne dépend du moyen de paiement — c'est le principe, et le
 * modèle ne permet même pas de l'exprimer.
 */
@Injectable()
export class CommissionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: {
    organizationId: string;
    countryCode: string;
    now?: Date;
  }): Promise<ResolvedCommissionPolicy> {
    const now = input.now ?? new Date();

    const candidates = await this.prisma.commissionPolicy.findMany({
      where: {
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
        AND: {
          OR: [
            { organizationId: input.organizationId },
            { organizationId: null, countryCode: input.countryCode },
            { organizationId: null, countryCode: null },
          ],
        },
      },
      orderBy: { validFrom: 'desc' },
    });

    const pick =
      candidates.find((row) => row.organizationId === input.organizationId) ??
      candidates.find(
        (row) => row.organizationId === null && row.countryCode === input.countryCode,
      ) ??
      candidates.find((row) => row.organizationId === null && row.countryCode === null);

    if (!pick) {
      return { id: null, policy: DEFAULT_COMMISSION_POLICY };
    }

    return { id: pick.id, policy: toPolicy(pick) };
  }

  /** Politique d'une organisation, pour ses retraits — celle de son pays à défaut. */
  async resolveForOrganization(organizationId: string): Promise<CommissionPolicy> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { countryCode: true },
    });

    const resolved = await this.resolve({
      organizationId,
      countryCode: organization?.countryCode ?? 'BJ',
    });

    return resolved.policy;
  }
}

function toPolicy(row: CommissionPolicyRow): CommissionPolicy {
  return {
    percentageBps: row.percentageBps,
    fixedAmountPerTicket: row.fixedAmountPerTicket,
    minFeePerOrder: row.minFeePerOrder ?? undefined,
    maxFeePerOrder: row.maxFeePerOrder ?? undefined,
    buyerSharePercent: row.buyerSharePercent,
    appliesToFreeTickets: row.appliesToFreeTickets,
    payoutFeeBps: row.payoutFeeBps,
    payoutFeeMax: row.payoutFeeMax,
    minPayoutAmount: row.minPayoutAmount,
  };
}
