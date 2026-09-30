import { Injectable, NotFoundException } from '@nestjs/common';
import type { FollowState, FollowedOrganization } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Suivre un organisateur.
 *
 * Suivre, c'est demander à être prévenu de ses prochaines publications — rien
 * d'autre : l'organisateur ne voit pas qui le suit, seulement combien. Une
 * liste nominative de ses abonnés lui donnerait un fichier de contacts que
 * personne ne lui a confié.
 */
@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, now = new Date()): Promise<FollowedOrganization[]> {
    const rows = await this.prisma.organizationFollow.findMany({
      where: { userId, organization: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        organization: {
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            verificationStatus: true,
            _count: {
              select: {
                events: {
                  where: {
                    deletedAt: null,
                    visibility: 'PUBLIC',
                    status: { in: ['PUBLISHED', 'SOLD_OUT'] },
                    startsAt: { gt: now },
                  },
                },
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.organization.id,
      slug: row.organization.slug,
      name: row.organization.name,
      logoUrl: row.organization.logoUrl,
      verified: row.organization.verificationStatus === 'VERIFIED',
      upcomingEventsCount: row.organization._count.events,
      followedAt: row.createdAt.toISOString(),
    }));
  }

  async state(userId: string, slug: string): Promise<FollowState> {
    const organization = await this.findFollowable(slug);
    return this.stateOf(userId, organization.id);
  }

  /** Idempotent : suivre deux fois ne crée qu'un suivi. */
  async follow(userId: string, slug: string): Promise<FollowState> {
    const organization = await this.findFollowable(slug);

    await this.prisma.organizationFollow.createMany({
      data: [{ userId, organizationId: organization.id }],
      skipDuplicates: true,
    });

    return this.stateOf(userId, organization.id);
  }

  /** Idempotent : ne plus suivre ce qu'on ne suivait pas n'est pas une erreur. */
  async unfollow(userId: string, slug: string): Promise<FollowState> {
    const organization = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!organization) throw new NotFoundException("Cet organisateur n'existe pas.");

    await this.prisma.organizationFollow.deleteMany({
      where: { userId, organizationId: organization.id },
    });

    return this.stateOf(userId, organization.id);
  }

  /** Une organisation suspendue ou fermée ne se suit plus : elle ne publiera rien. */
  private async findFollowable(slug: string): Promise<{ id: string }> {
    const organization = await this.prisma.organization.findFirst({
      where: { slug, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!organization) throw new NotFoundException("Cet organisateur n'existe pas.");

    return organization;
  }

  private async stateOf(userId: string, organizationId: string): Promise<FollowState> {
    const [mine, followersCount] = await Promise.all([
      this.prisma.organizationFollow.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { createdAt: true },
      }),
      this.prisma.organizationFollow.count({ where: { organizationId } }),
    ]);

    return { following: mine !== null, followersCount };
  }
}
