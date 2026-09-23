import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminCommissionPolicy,
  CommissionScope,
  CreateCommissionPolicyInput,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';

/**
 * Politiques de commission, vues de la console.
 *
 * ── Une politique ne se modifie jamais ──────────────────────────────────────
 * Chaque commande garde l'identifiant de la politique qui l'a tarifée ; en
 * changer les taux réécrirait l'explication de ventes passées. Changer une
 * commission, c'est donc publier une NOUVELLE version : elle ferme, à
 * l'instant où elle prend effet, celle qui était en vigueur pour la même
 * portée. L'historique reste lisible, version après version.
 *
 * ── La plus spécifique l'emporte ────────────────────────────────────────────
 * Organisation > pays > plateforme — voir `CommissionService.resolve`. Une
 * politique d'organisation sert une remise négociée ; une politique de pays
 * ouvre un marché à ses propres conditions.
 */
@Injectable()
export class AdminCommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminCommissionPolicy[]> {
    const now = new Date();

    const rows = await this.prisma.commissionPolicy.findMany({
      orderBy: [{ validFrom: 'desc' }],
      include: {
        organization: { select: { name: true } },
        _count: { select: { orders: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      scope: scopeOf(row),
      countryCode: row.countryCode,
      organizationId: row.organizationId,
      organizationName: row.organization?.name ?? null,
      percentageBps: row.percentageBps,
      fixedAmountPerTicket: row.fixedAmountPerTicket,
      minFeePerOrder: row.minFeePerOrder,
      maxFeePerOrder: row.maxFeePerOrder,
      buyerSharePercent: row.buyerSharePercent,
      appliesToFreeTickets: row.appliesToFreeTickets,
      payoutFeeBps: row.payoutFeeBps,
      payoutFeeMax: row.payoutFeeMax,
      minPayoutAmount: row.minPayoutAmount,
      validFrom: row.validFrom.toISOString(),
      validTo: row.validTo?.toISOString() ?? null,
      current: row.isActive && row.validFrom <= now && (row.validTo === null || row.validTo > now),
      ordersCount: row._count.orders,
    }));
  }

  /**
   * Publie une nouvelle version pour une portée.
   *
   * Dans une seule transaction : la version en vigueur se ferme à l'instant
   * même où la nouvelle commence. Il n'existe ainsi aucune seconde sans
   * politique, ni aucune seconde avec deux.
   */
  async create(input: CreateCommissionPolicyInput, actorUserId: string): Promise<void> {
    const scope = scopeWhere(input);

    if (input.scope === 'ORGANIZATION') {
      const exists = await this.prisma.organization.count({ where: { id: input.organizationId } });
      if (!exists) throw new NotFoundException("Cette organisation n'existe pas.");
    }

    if (input.scope === 'COUNTRY') {
      const exists = await this.prisma.country.count({ where: { code: input.countryCode } });
      if (!exists) throw new BadRequestException("Ce pays n'est pas connu de la plateforme.");
    }

    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const closed = await tx.commissionPolicy.updateMany({
        where: { ...scope, OR: [{ validTo: null }, { validTo: { gt: now } }] },
        data: { validTo: now },
      });

      const policy = await tx.commissionPolicy.create({
        data: {
          name: input.name,
          countryCode: input.scope === 'COUNTRY' ? input.countryCode : null,
          organizationId: input.scope === 'ORGANIZATION' ? input.organizationId : null,
          percentageBps: input.percentageBps,
          fixedAmountPerTicket: input.fixedAmountPerTicket,
          minFeePerOrder: input.minFeePerOrder,
          maxFeePerOrder: input.maxFeePerOrder,
          buyerSharePercent: input.buyerSharePercent,
          appliesToFreeTickets: input.appliesToFreeTickets,
          payoutFeeBps: input.payoutFeeBps,
          payoutFeeMax: input.payoutFeeMax,
          minPayoutAmount: input.minPayoutAmount,
          isActive: true,
          validFrom: now,
        },
      });

      return { policy, closed: closed.count };
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.commissionPolicyPublished,
      entityType: 'commission_policy',
      entityId: created.policy.id,
      actorUserId,
      organizationId: created.policy.organizationId ?? undefined,
      changes: { ...input, previousVersionsClosed: created.closed },
    });
  }

  /**
   * Ferme une politique sans la remplacer.
   *
   * La portée retombe alors sur la politique moins spécifique : une remise
   * d'organisation qui prend fin rend l'organisation au tarif de son pays.
   * Fermer la politique de la PLATEFORME n'est pas permis — il ne resterait
   * que la constante de repli, que personne n'a choisie.
   */
  async close(policyId: string, actorUserId: string): Promise<void> {
    const policy = await this.prisma.commissionPolicy.findUnique({ where: { id: policyId } });

    if (!policy) {
      throw new NotFoundException("Cette politique n'existe pas.");
    }

    if (scopeOf(policy) === 'PLATFORM') {
      throw new ConflictException(
        'La politique de la plateforme ne se ferme pas : publie plutôt une nouvelle version.',
      );
    }

    const now = new Date();

    if (policy.validTo !== null && policy.validTo <= now) {
      throw new ConflictException('Cette politique est déjà close.');
    }

    await this.prisma.commissionPolicy.update({ where: { id: policyId }, data: { validTo: now } });

    await this.audit.record({
      action: AUDIT_ACTIONS.commissionPolicyClosed,
      entityType: 'commission_policy',
      entityId: policyId,
      actorUserId,
      organizationId: policy.organizationId ?? undefined,
      changes: { name: policy.name },
    });
  }
}

function scopeOf(row: {
  countryCode: string | null;
  organizationId: string | null;
}): CommissionScope {
  if (row.organizationId) return 'ORGANIZATION';
  if (row.countryCode) return 'COUNTRY';
  return 'PLATFORM';
}

/** Les politiques de même portée que la nouvelle : celles qu'elle remplace. */
function scopeWhere(input: CreateCommissionPolicyInput): Prisma.CommissionPolicyWhereInput {
  switch (input.scope) {
    case 'ORGANIZATION':
      return { organizationId: input.organizationId };
    case 'COUNTRY':
      return { organizationId: null, countryCode: input.countryCode };
    case 'PLATFORM':
      return { organizationId: null, countryCode: null };
  }
}
