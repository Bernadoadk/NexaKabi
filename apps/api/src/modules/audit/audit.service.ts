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
  /**
   * Transaction présentée pour un paiement, refusée à la vérification : elle
   * appartient à un autre paiement, ou ne porte pas le bon montant. C'est la
   * trace d'une page qui s'est trompée — ou qui a essayé.
   */
  paymentVerificationRejected: 'payment.verification_rejected',
  /** Tentative échouée dans la fenêtre du prestataire ; le paiement reste ouvert. */
  paymentAttemptFailed: 'payment.attempt_failed',
  /** Succès confirmé après la fin de la réservation ; la commande a pu être honorée. */
  paymentLateSettled: 'payment.late_settled',
  /** Succès confirmé, mais la commande ne peut plus être honorée : à rembourser. */
  paymentUnfulfillable: 'payment.unfulfillable',
  /** Succès confirmé sur une commande déjà réglée par un autre paiement : à rembourser. */
  paymentDuplicate: 'payment.duplicate',
  /** Transaction du prestataire rattachée à la main par un administrateur. */
  paymentTransactionAttached: 'payment.transaction_attached',

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
  /** Nouvelle version d'une politique de commission : elle ferme la précédente. */
  commissionPolicyPublished: 'commission_policy.published',
  commissionPolicyClosed: 'commission_policy.closed',

  /** Remboursement décidé : inscrit au grand livre, pas encore exécuté. */
  refundRequested: 'refund.requested',
  /** Accepté par le prestataire : l'argent est en route. */
  refundIssued: 'refund.issued',
  /**
   * Refusé par le prestataire, ou impossible à créer.
   *
   * Une ligne par remboursement : c'est la liste de ce qu'il reste à rendre à
   * la main, et elle doit survivre à la rotation des journaux.
   */
  refundFailed: 'refund.failed',
  /** Hors de portée du prestataire (délai dépassé, partiel…) : à faire à la main. */
  refundManualRequired: 'refund.manual_required',
  /** Le participant est remboursé — par le prestataire. */
  refundCompleted: 'refund.completed',
  /** Remboursement fait hors API, consigné par un administrateur. */
  refundRecorded: 'refund.recorded',
  /**
   * Le prestataire annonce avoir remboursé ce qu'un administrateur a déjà
   * rendu à la main : le participant a peut-être été remboursé deux fois.
   */
  refundDuplicateSuspected: 'refund.duplicate_suspected',
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
  /**
   * Configuration des pays et des moyens de paiement.
   *
   * Un geste ici change ce que des milliers de participants voient au moment
   * de payer, et par où l'argent des organisateurs transite : il est tracé
   * comme un mouvement d'argent.
   */
  settingsCountryUpdated: 'settings.country.updated',
  settingsPaymentMethodUpdated: 'settings.payment_method.updated',
  settingsPaymentMethodRemoved: 'settings.payment_method.removed',
  settingsProviderSynced: 'settings.provider.synced',
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
