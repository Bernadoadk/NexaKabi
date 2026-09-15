/**
 * Énumérations du domaine.
 *
 * Source unique de vérité partagée entre l'API, le web et la base de données.
 * Toute valeur ajoutée ici doit l'être aussi dans le schéma Prisma correspondant.
 *
 * Voir docs/DATABASE_PROPOSAL.md §11 pour les machines à états.
 */

import { z } from 'zod';

/** Crée une énumération Zod et son type TypeScript à partir d'un tuple constant. */
function makeEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return { values, schema: z.enum(values) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Identité et accès
// ─────────────────────────────────────────────────────────────────────────────

export const GLOBAL_ROLES = ['USER', 'SUPPORT', 'ADMIN', 'SUPERADMIN'] as const;
export const globalRoleSchema = makeEnum(GLOBAL_ROLES).schema;
export type GlobalRole = z.infer<typeof globalRoleSchema>;

export const USER_STATUSES = ['UNVERIFIED', 'ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export const userStatusSchema = makeEnum(USER_STATUSES).schema;
export type UserStatus = z.infer<typeof userStatusSchema>;

export const OTP_PURPOSES = ['LOGIN', 'PHONE_CHANGE', 'TEAM_INVITE', 'TICKET_RECOVERY'] as const;
export const otpPurposeSchema = makeEnum(OTP_PURPOSES).schema;
export type OtpPurpose = z.infer<typeof otpPurposeSchema>;

export const OTP_CHANNELS = ['SMS', 'WHATSAPP'] as const;
export const otpChannelSchema = makeEnum(OTP_CHANNELS).schema;
export type OtpChannel = z.infer<typeof otpChannelSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Organisation
// ─────────────────────────────────────────────────────────────────────────────

export const ORGANIZATION_TYPES = ['INDIVIDUAL', 'COMPANY', 'ASSOCIATION', 'INSTITUTION'] as const;
export const organizationTypeSchema = makeEnum(ORGANIZATION_TYPES).schema;
export type OrganizationType = z.infer<typeof organizationTypeSchema>;

export const ORGANIZATION_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;
export const organizationStatusSchema = makeEnum(ORGANIZATION_STATUSES).schema;
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;

export const VERIFICATION_STATUSES = [
  'UNVERIFIED',
  'PENDING',
  'INCOMPLETE',
  'VERIFIED',
  'REJECTED',
] as const;
export const verificationStatusSchema = makeEnum(VERIFICATION_STATUSES).schema;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

/**
 * Rôles au sein d'une organisation.
 * Les libellés exposés à l'utilisateur figurent dans ORG_ROLE_LABELS ci-dessous :
 * le prototype impose une phrase compréhensible, jamais une matrice de permissions.
 */
export const ORG_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SCANNER', 'ANALYST'] as const;
export const orgRoleSchema = makeEnum(ORG_ROLES).schema;
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const MEMBER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const;
export const memberStatusSchema = makeEnum(MEMBER_STATUSES).schema;
export type MemberStatus = z.infer<typeof memberStatusSchema>;

/**
 * Pièces recevables à l'appui d'une vérification.
 *
 * Volontairement AUCUNE pièce d'identité personnelle (carte nationale,
 * passeport) : les conserver expose à des sanctions sous la réglementation
 * béninoise de protection des données, pour un bénéfice qu'un rapprochement
 * avec le compte de retrait Mobile Money obtient déjà sans rien stocker — cet
 * opérateur a lui-même vérifié l'identité à l'ouverture du compte. Seuls des
 * documents sur l'ENTITÉ légale (jamais sur la personne) restent acceptés,
 * et seulement pour une organisation qui n'est pas une personne physique —
 * voir `verification/page.tsx` côté web.
 */
export const DOCUMENT_TYPES = [
  'RCCM',
  'IFU',
  'ASSOCIATION_STATUTES',
  'OTHER',
] as const;
export const documentTypeSchema = makeEnum(DOCUMENT_TYPES).schema;
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const PAYOUT_ACCOUNT_TYPES = ['MOBILE_MONEY', 'BANK'] as const;
export const payoutAccountTypeSchema = makeEnum(PAYOUT_ACCOUNT_TYPES).schema;
export type PayoutAccountType = z.infer<typeof payoutAccountTypeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Événement
// ─────────────────────────────────────────────────────────────────────────────

export const EVENT_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'REJECTED',
  'PUBLISHED',
  'SOLD_OUT',
  'POSTPONED',
  'CANCELLED',
  'COMPLETED',
  'ARCHIVED',
] as const;
export const eventStatusSchema = makeEnum(EVENT_STATUSES).schema;
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const EVENT_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export const eventVisibilitySchema = makeEnum(EVENT_VISIBILITIES).schema;
export type EventVisibility = z.infer<typeof eventVisibilitySchema>;

export const EVENT_FORMATS = ['PHYSICAL', 'ONLINE', 'HYBRID'] as const;
export const eventFormatSchema = makeEnum(EVENT_FORMATS).schema;
export type EventFormat = z.infer<typeof eventFormatSchema>;

export const REFUND_POLICIES = ['UNTIL_DAYS_BEFORE', 'NONE', 'CASE_BY_CASE'] as const;
export const refundPolicySchema = makeEnum(REFUND_POLICIES).schema;
export type RefundPolicy = z.infer<typeof refundPolicySchema>;

export const TICKET_TYPE_STATUSES = ['DRAFT', 'ON_SALE', 'PAUSED', 'SOLD_OUT', 'CLOSED'] as const;
export const ticketTypeStatusSchema = makeEnum(TICKET_TYPE_STATUSES).schema;
export type TicketTypeStatus = z.infer<typeof ticketTypeStatusSchema>;

export const TICKET_VISIBILITIES = ['PUBLIC', 'HIDDEN'] as const;
export const ticketVisibilitySchema = makeEnum(TICKET_VISIBILITIES).schema;
export type TicketVisibility = z.infer<typeof ticketVisibilitySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Commande, paiement, billet
// ─────────────────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  'DRAFT',
  'AWAITING_PAYMENT',
  'PAID',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export const orderStatusSchema = makeEnum(ORDER_STATUSES).schema;
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const PAYMENT_STATUSES = [
  'INITIATED',
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export const paymentStatusSchema = makeEnum(PAYMENT_STATUSES).schema;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Moyens de paiement. L'ordre d'affichage n'est PAS celui de cette liste :
 * il est piloté par la configuration du back-office, par ville et par pays.
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.2.
 */
export const PAYMENT_PROVIDERS = [
  'mock',
  'mtn_momo',
  'moov_money',
  'celtiis_cash',
  'card',
  'point_of_sale',
] as const;
export const paymentProviderSchema = makeEnum(PAYMENT_PROVIDERS).schema;
export type PaymentProviderCode = z.infer<typeof paymentProviderSchema>;

export const TICKET_STATUSES = ['VALID', 'USED', 'CANCELLED', 'REFUNDED', 'EXPIRED'] as const;
export const ticketStatusSchema = makeEnum(TICKET_STATUSES).schema;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const REFUND_REASONS = [
  'EVENT_CANCELLED',
  'CUSTOMER_REQUEST',
  'DUPLICATE_PAYMENT',
  'DISPUTE',
  'ADMIN',
] as const;
export const refundReasonSchema = makeEnum(REFUND_REASONS).schema;
export type RefundReason = z.infer<typeof refundReasonSchema>;

export const REFUND_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export const refundStatusSchema = makeEnum(REFUND_STATUSES).schema;
export type RefundStatus = z.infer<typeof refundStatusSchema>;

/**
 * Verdict rendu par le scanner. Trois couleurs pleine page, jamais un badge.
 *
 * Deux verdicts ont été ajoutés en implémentant la vérification hors ligne :
 *
 *  · `VALID_OFF_MANIFEST` — billet authentique ABSENT du carnet local, donc
 *    vendu après son téléchargement. Le confondre avec `INVALID` refuserait
 *    l'entrée à quelqu'un qui vient de payer : c'est le faux négatif le plus
 *    coûteux du produit. La signature suffit à autoriser.
 *  · `UNREADABLE` — le code scanné n'est pas un billet Nexa-Kabi. Distinct
 *    d'`INVALID`, qui désigne un billet dont la SIGNATURE est fausse : le
 *    premier appelle « réessaie », le second appelle un responsable.
 */
export const CHECKIN_VERDICTS = [
  'VALID',
  'VALID_OFF_MANIFEST',
  'ALREADY_USED',
  'INVALID',
  'WRONG_EVENT',
  'EXPIRED',
  'CANCELLED',
  'UNREADABLE',
] as const;
export const checkInVerdictSchema = makeEnum(CHECKIN_VERDICTS).schema;
export type CheckInVerdict = z.infer<typeof checkInVerdictSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Finance
// ─────────────────────────────────────────────────────────────────────────────

export const LEDGER_ENTRY_TYPES = [
  'SALE',
  'PLATFORM_FEE',
  'PROVIDER_FEE',
  'HOLD',
  'RELEASE',
  'REFUND',
  'REFUND_FEE_REVERSAL',
  'PAYOUT',
  'PAYOUT_FEE',
  'PAYOUT_REVERSAL',
  'FREEZE',
  'UNFREEZE',
  'ADJUSTMENT',
] as const;
export const ledgerEntryTypeSchema = makeEnum(LEDGER_ENTRY_TYPES).schema;
export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

export const BALANCE_STATES = ['PENDING', 'AVAILABLE'] as const;
export const balanceStateSchema = makeEnum(BALANCE_STATES).schema;
export type BalanceState = z.infer<typeof balanceStateSchema>;

export const PAYOUT_STATUSES = ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'] as const;
export const payoutStatusSchema = makeEnum(PAYOUT_STATUSES).schema;
export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Promotion
// ─────────────────────────────────────────────────────────────────────────────

export const PROMO_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE'] as const;
export const promoTypeSchema = makeEnum(PROMO_TYPES).schema;
export type PromoType = z.infer<typeof promoTypeSchema>;

export const INVITATION_KINDS = ['ARTIST', 'PRESS', 'PARTNER', 'SPONSOR', 'VIP'] as const;
export const invitationKindSchema = makeEnum(INVITATION_KINDS).schema;
export type InvitationKind = z.infer<typeof invitationKindSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Communication et modération
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quatre types de notification seulement, chacun actionnable.
 * Contrainte produit du prototype : aucune notification promotionnelle non sollicitée.
 */
export const NOTIFICATION_TYPES = [
  'PAYMENT_CONFIRMED',
  'EVENT_REMINDER',
  'EVENT_UPDATED',
  'ORGANIZER_PUBLISHED',
] as const;
export const notificationTypeSchema = makeEnum(NOTIFICATION_TYPES).schema;
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] as const;
export const notificationChannelSchema = makeEnum(NOTIFICATION_CHANNELS).schema;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const REPORT_TARGET_TYPES = ['EVENT', 'ORGANIZATION', 'USER'] as const;
export const reportTargetTypeSchema = makeEnum(REPORT_TARGET_TYPES).schema;
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;

export const REPORT_REASONS = ['FRAUD', 'FALSE_INFO', 'INAPPROPRIATE', 'NO_SHOW', 'OTHER'] as const;
export const reportReasonSchema = makeEnum(REPORT_REASONS).schema;
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const REPORT_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'] as const;
export const reportStatusSchema = makeEnum(REPORT_STATUSES).schema;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
