import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Actions tracées.
 *
 * Format `domaine.verbe`. La liste est fermée volontairement : un journal
 * d'audit dont les libellés sont libres devient illisible au bout de six mois.
 */
export const AUDIT_ACTIONS = {
  organizationCreated: 'organization.created',
  organizationUpdated: 'organization.updated',
  organizationDeleted: 'organization.deleted',
  organizationTransferred: 'organization.transferred',
  organizationFrozen: 'organization.payout_frozen',
  organizationUnfrozen: 'organization.payout_unfrozen',

  memberInvited: 'member.invited',
  memberJoined: 'member.joined',
  memberRoleChanged: 'member.role_changed',
  memberRemoved: 'member.removed',
  invitationRevoked: 'member.invitation_revoked',

  payoutAccountAdded: 'payout_account.added',
  payoutAccountRemoved: 'payout_account.removed',

  verificationSubmitted: 'verification.submitted',
  verificationReviewed: 'verification.reviewed',
  verificationDocumentViewed: 'verification.document_viewed',

  eventCreated: 'event.created',
  eventPublished: 'event.published',
  eventSubmittedForReview: 'event.submitted_for_review',
  eventCancelled: 'event.cancelled',
  /** Retour au brouillon d'un événement en ligne ou en vérification, sans vente. */
  eventUnpublished: 'event.unpublished',
  /** Suppression logique : la ligne reste en base, marquée `deletedAt`. */
  eventDeleted: 'event.deleted',
  ticketTypeCreated: 'ticket_type.created',
  ticketTypeUpdated: 'ticket_type.updated',

  orderCreated: 'order.created',
  orderPaid: 'order.paid',
  orderExpired: 'order.expired',
  orderCancelled: 'order.cancelled',

  paymentInitiated: 'payment.initiated',
  paymentSucceeded: 'payment.succeeded',
  paymentFailed: 'payment.failed',
  /** Webhook reçu après un état terminal : consigné, jamais appliqué. */
  paymentWebhookIgnored: 'payment.webhook_ignored',
  /** Écart rattrapé par la réconciliation : un webhook s'est perdu. */
  paymentReconciled: 'payment.reconciled',

  ticketIssued: 'ticket.issued',
  ticketCancelled: 'ticket.cancelled',

  /** Entrée annulée à la porte : « scanné par erreur », « refusé ». */
  checkInRevoked: 'checkin.revoked',
  /**
   * Entrée accordée sans lecture du QR, depuis la recherche manuelle.
   *
   * Tracée nominativement : c'est la contrepartie du secours. Accorder une
   * entrée sans preuve cryptographique reste possible — un QR déchiré ne doit
   * pas laisser un porteur légitime à la porte — mais jamais anonymement.
   */
  checkInManual: 'checkin.manual',
  /** Double scan arbitré à la synchronisation. */
  checkInConflictResolved: 'checkin.conflict_resolved',

  payoutRequested: 'payout.requested',
  payoutProcessed: 'payout.processed',
  payoutFailed: 'payout.failed',
  /** Correction manuelle du grand livre. Motif obligatoire. */
  ledgerAdjusted: 'ledger.adjusted',

  refundIssued: 'refund.issued',
  /**
   * Remboursement automatique impossible sur un événement annulé.
   *
   * Une ligne par commande : c'est la liste de ce qu'il reste à rendre à la
   * main, et elle doit survivre à la rotation des journaux.
   */
  refundFailed: 'refund.failed',
  /** Recettes du palier 0 replanifiées à la vérification de l'organisation. */
  ledgerHoldReleased: 'ledger.hold_released',

  // ── Administration ────────────────────────────────────────────────────────
  //
  // Chaque connexion est tracée. Un accès aux pièces d'identité de tous les
  // organisateurs et au gel des fonds se justifie a posteriori, ou ne se
  // justifie pas.
  adminLoginCompleted: 'admin.login.completed',
  adminPasswordChanged: 'admin.password.changed',
  /**
   * Composition de l'équipe par le propriétaire : qui a donné quel droit à
   * qui, et quand. Une équipe qui touche à l'argent doit pouvoir le dire.
   */
  adminStaffCreated: 'admin.staff.created',
  adminStaffUpdated: 'admin.staff.updated',
  adminStaffSuspended: 'admin.staff.suspended',
  adminStaffReactivated: 'admin.staff.reactivated',
  adminStaffPasswordReset: 'admin.staff.password_reset',
  adminStaffDeleted: 'admin.staff.deleted',
  adminVerificationReviewed: 'admin.verification.reviewed',
  /**
   * Destruction des pièces d'identité après décision.
   *
   * Tracé comme le reste : « ces fichiers ont existé, ils ont été détruits ce
   * jour-là, sur cette décision ». C'est ce qui permet de répondre à une
   * demande d'accès d'un organisateur des mois plus tard.
   */
  adminVerificationDocumentsPurged: 'admin.verification.documents_purged',
  /** Revue du premier événement d'une organisation, avant publication. */
  adminEventReviewed: 'admin.event.reviewed',
  adminReportResolved: 'admin.report.resolved',
  adminFundsFrozen: 'admin.funds.frozen',
  adminFundsUnfrozen: 'admin.funds.unfrozen',
  adminUserSuspended: 'admin.user.suspended',
  adminUserReactivated: 'admin.user.reactivated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorUserId?: string;
  readonly actorType?: 'USER' | 'ADMIN' | 'SYSTEM';
  readonly organizationId?: string;
  /** État avant et après, pour les modifications. */
  readonly changes?: Prisma.InputJsonValue;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Journal d'audit.
 *
 * Exigence explicite du prototype : « Toute action sensible est horodatée et
 * attribuée : c'est indispensable dès qu'une équipe touche à l'argent. »
 *
 * Deux principes :
 *   — les lignes ne sont JAMAIS modifiées ni supprimées ;
 *   — une écriture d'audit qui échoue ne doit pas faire échouer l'action
 *     métier. Perdre une ligne de journal est regrettable ; perdre une
 *     inscription d'équipe parce que le journal était indisponible ne l'est pas.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          actorUserId: entry.actorUserId,
          actorType: entry.actorType ?? 'USER',
          organizationId: entry.organizationId,
          changes: entry.changes,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, entry }, "Échec d'écriture au journal d'audit");
    }
  }

  /**
   * Journal d'activité d'une organisation, tel qu'il est montré dans l'écran
   * « Équipe & rôles » du prototype.
   */
  listForOrganization(organizationId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }
}
