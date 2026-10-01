import { Injectable } from '@nestjs/common';
import { canActOnEvent, hasOrgPermission, type OrgPermission } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Qui, dans une organisation, doit apprendre quelque chose.
 *
 * ── Par permission, jamais par rôle ─────────────────────────────────────────
 * « Les retraits » ne se disent pas à un gestionnaire, qui n'y a pas accès :
 * `payout:request` désigne le propriétaire et les administrateurs. « Les ventes »
 * vont à qui gère les billets. On demande donc la PERMISSION que le message
 * suppose, et la matrice des rôles (`permissions.ts`) répond — sans qu'aucun
 * rôle ne soit écrit en dur ici, et sans qu'un rôle ajouté plus tard ne soit
 * oublié.
 *
 * Le propriétaire est toujours du nombre : sa ligne de membre peut manquer sur
 * une organisation ancienne, et personne n'a plus de raison que lui d'apprendre
 * ce qui arrive à son argent.
 */
@Injectable()
export class OrganizationAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Les personnes qui détiennent `permission` dans l'organisation.
   *
   * `eventId` : pour une permission qui porte sur un événement précis, les rôles
   * limités à quelques événements (un contrôleur) ne comptent que s'il figure
   * dans leur périmètre.
   */
  async recipients(
    organizationId: string,
    permission: OrgPermission,
    options: { eventId?: string; now?: Date } = {},
  ): Promise<string[]> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        ownerId: true,
        members: {
          where: { status: 'ACTIVE' },
          select: { userId: true, role: true, scopedEventIds: true, expiresAt: true },
        },
      },
    });

    if (!organization) return [];

    const now = options.now ?? new Date();
    const userIds = new Set<string>([organization.ownerId]);

    for (const member of organization.members) {
      // Un accès à durée limitée — le contrôleur d'une soirée — s'éteint de lui-même.
      if (member.expiresAt && member.expiresAt <= now) continue;

      const allowed = options.eventId
        ? canActOnEvent(member.role, permission, options.eventId, member.scopedEventIds)
        : hasOrgPermission(member.role, permission);

      if (allowed) userIds.add(member.userId);
    }

    return [...userIds];
  }
}
