import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminUserDetail,
  AdminUserSummary,
  GlobalRole,
  UserStatus,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';

export interface ListUsersFilter {
  search?: string;
  globalRole?: GlobalRole;
  status?: UserStatus;
}

/**
 * Comptes, vus depuis la plateforme.
 *
 * ── Pourquoi un seul service pour acheteurs et organisateurs ─────────────
 * `User` ne distingue pas structurellement les deux : c'est l'appartenance à
 * une organisation qui fait la différence, pas un champ. Avant ce service, la
 * seule façon de retrouver un compte était de tomber dessus par un
 * signalement ou une vérification déjà ouverte contre lui — il n'existait
 * aucun moyen de le chercher pour lui-même.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filter: ListUsersFilter = {}): Promise<AdminUserSummary[]> {
    const users = await this.prisma.user.findMany({
      where: {
        ...(filter.search
          ? {
              OR: [
                { fullName: { contains: filter.search, mode: 'insensitive' as const } },
                { phone: { contains: filter.search } },
                { email: { contains: filter.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(filter.globalRole ? { globalRole: filter.globalRole } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        globalRole: true,
        status: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    });

    return users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      globalRole: user.globalRole,
      status: user.status,
      organizationsCount: user._count.memberships,
      createdAt: user.createdAt.toISOString(),
    }));
  }

  async getOne(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        globalRole: true,
        status: true,
        suspendedReason: true,
        lastSeenAt: true,
        createdAt: true,
        _count: { select: { memberships: true, orders: true } },
        memberships: {
          where: { status: 'ACTIVE' },
          select: { role: true, organization: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Ce compte n’existe pas.');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      globalRole: user.globalRole,
      status: user.status,
      suspendedReason: user.suspendedReason,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      organizationsCount: user._count.memberships,
      ordersCount: user._count.orders,
      createdAt: user.createdAt.toISOString(),
      organizations: user.memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
      })),
    };
  }

  /**
   * Suspend un compte.
   *
   * ── Ce que ça arrête, et ce que ça n'efface pas ──────────────────────────
   * Un compte suspendu ne peut plus se connecter (le garde de session le
   * vérifie) ; ses organisations, ses billets et son historique restent
   * intacts. Suspendre n'est pas supprimer — c'est réversible par
   * construction, comme le gel de fonds.
   */
  async suspend(userId: string, reason: string, actorId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, globalRole: true },
    });

    if (user.globalRole !== 'USER') {
      throw new BadRequestException(
        'Un compte administrateur ou support ne se suspend pas depuis cet écran.',
      );
    }

    if (user.status === 'SUSPENDED') {
      throw new BadRequestException('Ce compte est déjà suspendu.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED', suspendedReason: reason },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.adminUserSuspended,
      entityType: 'User',
      entityId: userId,
      actorUserId: actorId,
      actorType: 'ADMIN',
      changes: { reason },
    });
  }

  async reactivate(userId: string, actorId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true },
    });

    if (user.status !== 'SUSPENDED') {
      throw new BadRequestException('Ce compte n’est pas suspendu.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', suspendedReason: null },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.adminUserReactivated,
      entityType: 'User',
      entityId: userId,
      actorUserId: actorId,
      actorType: 'ADMIN',
    });
  }
}
