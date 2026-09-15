import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ActivityEntry,
  OrganizationAdminDetail,
  OrganizationAdminSummary,
  VerificationStatus,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../finance/ledger.service';

export interface ListOrganizationsFilter {
  search?: string;
  verificationStatus?: VerificationStatus;
  payoutFrozen?: boolean;
}

/**
 * Organisations, vues depuis la plateforme.
 *
 * ── Le manque que ce service comble ───────────────────────────────────────
 * Trois écrans montraient chacun une tranche d'une organisation — le dossier
 * de vérification, un événement en attente, un signalement — mais aucun ne
 * permettait de les parcourir pour elles-mêmes. Geler un compte n'était
 * possible qu'en passant par un signalement déjà ouvert contre lui ; le
 * consulter, qu'en tombant dessus par un autre écran.
 */
@Injectable()
export class AdminOrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /** Deux cents au plus : au volume attendu, une organisation cherchée s'y trouve. */
  async list(filter: ListOrganizationsFilter = {}): Promise<OrganizationAdminSummary[]> {
    const organizations = await this.prisma.organization.findMany({
      where: {
        ...(filter.search
          ? { name: { contains: filter.search, mode: 'insensitive' as const } }
          : {}),
        ...(filter.verificationStatus ? { verificationStatus: filter.verificationStatus } : {}),
        ...(filter.payoutFrozen !== undefined ? { payoutFrozen: filter.payoutFrozen } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        verificationStatus: true,
        payoutFrozen: true,
        createdAt: true,
        _count: { select: { events: true } },
      },
    });

    const balances = await this.ledger.balancesFor(organizations.map((org) => org.id));

    return organizations.map((org) => ({
      id: org.id,
      slug: org.slug,
      name: org.name,
      type: org.type,
      verificationStatus: org.verificationStatus,
      payoutFrozen: org.payoutFrozen,
      eventsCount: org._count.events,
      balance: balances.get(org.id) ?? 0,
      createdAt: org.createdAt.toISOString(),
    }));
  }

  async getOne(organizationId: string): Promise<OrganizationAdminDetail> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        slug: true,
        name: true,
        legalName: true,
        type: true,
        cityName: true,
        verificationStatus: true,
        payoutFrozen: true,
        completedEventsCount: true,
        createdAt: true,
        owner: { select: { fullName: true, phone: true, email: true } },
        _count: { select: { events: true, members: true } },
      },
    });

    if (!organization) {
      throw new NotFoundException('Cette organisation n’existe pas.');
    }

    const balance = await this.ledger.balancesFor([organizationId]);

    return {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      legalName: organization.legalName,
      type: organization.type,
      cityName: organization.cityName,
      verificationStatus: organization.verificationStatus,
      payoutFrozen: organization.payoutFrozen,
      eventsCount: organization._count.events,
      membersCount: organization._count.members,
      completedEventsCount: organization.completedEventsCount,
      balance: balance.get(organizationId) ?? 0,
      createdAt: organization.createdAt.toISOString(),
      ownerName: organization.owner.fullName,
      ownerPhone: organization.owner.phone,
      ownerEmail: organization.owner.email,
    };
  }

  /**
   * Journal d'activité de l'organisation.
   *
   * `AuditService.listForOrganization()` existait déjà — construit pour cet
   * écran précisément — mais n'était appelé nulle part : `ActivityEntry`,
   * son type de présentation, était lui aussi défini sans jamais être produit.
   * Cette méthode fait le pont : elle résout le nom de l'auteur et dérive un
   * résumé lisible du code d'action, sans réinventer un gabarit de phrase par
   * type d'action — le code (`admin.funds.frozen`, `member.role_changed`…)
   * est déjà explicite une fois mis en forme.
   */
  async listAudit(organizationId: string, limit = 50): Promise<ActivityEntry[]> {
    const rows = await this.audit.listForOrganization(organizationId, limit);

    const actorIds = [
      ...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => id !== null)),
    ];

    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];

    const actorNames = new Map(actors.map((actor) => [actor.id, actor.fullName]));

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorName: row.actorUserId ? (actorNames.get(row.actorUserId) ?? null) : null,
      entityType: row.entityType,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
      summary: humanizeAction(row.action),
    }));
  }
}

/** `admin.funds.frozen` → « Admin funds frozen ». Sans gabarit par action : le
 *  code lui-même, mis en forme, est déjà lisible. */
function humanizeAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').split(' ');
  return words.map((word, index) => (index === 0 ? capitalize(word) : word)).join(' ');
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}
