/**
 * Contrats de l'administration plateforme.
 *
 * ── Ce que l'administration peut faire, et ce qu'elle ne peut pas ──────────
 * Elle vérifie des organisations, instruit des signalements et gèle des fonds.
 * Elle ne peut PAS modifier un événement à la place d'un organisateur, ni
 * effacer une écriture du grand livre, ni changer un montant encaissé.
 *
 * Cette limite n'est pas une omission : un administrateur capable de tout
 * réécrire rend l'audit inutile, puisque plus rien ne distingue une correction
 * légitime d'un abus. Les corrections passent par des écritures inverses,
 * datées et attribuées, exactement comme le reste.
 */

import { z } from 'zod';
import { idSchema, phoneSchema, slugSchema } from './common.js';
import {
  globalRoleSchema,
  organizationTypeSchema,
  payoutStatusSchema,
  reportReasonSchema,
  reportStatusSchema,
  reportTargetTypeSchema,
  userStatusSchema,
  verificationStatusSchema,
} from './enums.js';
import { verificationChecksSchema, type VerificationChecks } from './organizations.js';
import { payoutSchema } from './finance.js';

// ─────────────────────────────────────────────────────────────────────────────
// Authentification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ouverture de session : première étape.
 *
 * Le mot de passe seul n'ouvre rien. Il produit une session « à moitié
 * authentifiée » qui ne donne accès qu'à l'écran de saisie du code TOTP.
 */
export const adminLoginSchema = z.object({
  email: z.string().email("Cette adresse n'est pas valide."),
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/** Seconde étape : code à six chiffres, ou code de secours. */
export const adminTotpSchema = z.object({
  /** Six chiffres du TOTP, ou un code de secours à usage unique. */
  code: z.string().trim().min(6, 'Le code compte six chiffres.').max(20, 'Ce code est trop long.'),
});

export type AdminTotpInput = z.infer<typeof adminTotpSchema>;

export const adminSessionSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  /**
   * Faux tant que le TOTP n'est pas validé.
   *
   * Le client s'en sert pour afficher l'écran de code plutôt que le tableau de
   * bord. Le serveur ne s'y fie PAS : chaque route vérifie elle-même.
   */
  totpVerified: z.boolean(),
  user: z.object({
    id: idSchema,
    fullName: z.string(),
    role: z.enum(['ADMIN', 'SUPERADMIN', 'SUPPORT']),
  }),
});

export type AdminSession = z.infer<typeof adminSessionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Vérification d'organisation — écran M3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les trois contrôles vivent dans `organizations.js` : c'est l'organisateur qui
 * dépose le dossier, l'administration qui le juge, mais la grille est la même
 * des deux côtés. La dupliquer ici ferait diverger un jour ce qui est déposé de
 * ce qui est évalué.
 *
 * ── Pourquoi trois cases plutôt qu'un bouton « Vérifier » ─────────────────
 * Parce qu'un dossier refusé doit dire LEQUEL des trois a échoué. « Dossier
 * incomplet » oblige l'organisateur à tout renvoyer, et le modérateur à tout
 * réexaminer. « Le nom sur la pièce ne correspond pas au compte de retrait »
 * se corrige en une fois.
 */

/**
 * Une vérification n'aboutit que si les contrôles applicables passent.
 *
 * `requiresDocument` : faux pour une personne physique — aucune pièce n'est
 * jamais demandée (voir `DOCUMENT_TYPES`), donc le troisième contrôle n'a
 * simplement rien à évaluer. Vrai par défaut : le code existant qui
 * n'indique rien continue de tout exiger, comme avant.
 */
export function allChecksPass(
  checks: VerificationChecks,
  options?: { requiresDocument?: boolean },
): boolean {
  const requiresDocument = options?.requiresDocument ?? true;
  return (
    checks.idMatchesPayoutAccount &&
    checks.phoneVerifiedByCode &&
    (!requiresDocument || checks.legalDocumentValid)
  );
}

/** Ce qui manque, formulé pour l'organisateur qui le lira. */
export function describeFailedChecks(
  checks: VerificationChecks,
  options?: { requiresDocument?: boolean },
): string[] {
  const requiresDocument = options?.requiresDocument ?? true;
  const missing: string[] = [];

  if (!checks.idMatchesPayoutAccount) {
    missing.push('Le nom déclaré ne correspond pas au titulaire du compte de retrait.');
  }

  if (!checks.phoneVerifiedByCode) {
    missing.push('Le numéro de téléphone déclaré n’a pas pu être confirmé.');
  }

  if (requiresDocument && !checks.legalDocumentValid) {
    missing.push('Le document légal fourni est illisible, expiré ou incomplet.');
  }

  return missing;
}

export const reviewVerificationSchema = z
  .object({
    checks: verificationChecksSchema,
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_MORE']),
    /**
     * Message envoyé à l'organisateur.
     *
     * Obligatoire dès qu'on ne valide pas : « refusé » sans motif produit un
     * second dossier identique, puis un appel au support.
     */
    note: z.string().trim().max(1_000).optional(),
  })
  .refine((input) => input.decision === 'APPROVE' || (input.note?.length ?? 0) >= 10, {
    message: 'Explique ce qui manque : l’organisateur ne verra que ce message.',
    path: ['note'],
  })
  .refine((input) => input.decision !== 'APPROVE' || allChecksPass(input.checks), {
    message: 'Les trois contrôles doivent être validés avant d’approuver.',
    path: ['checks'],
  });

export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;

export const verificationSummarySchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  organizationName: z.string(),
  status: verificationStatusSchema,
  contactName: z.string(),
  contactPhone: z.string(),
  submittedAt: z.string(),
  documentCount: z.number().int(),
  /** Recettes en attente sur ce dossier : indique l'urgence réelle. */
  pendingBalance: z.number().int(),
});

export type VerificationSummary = z.infer<typeof verificationSummarySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Signalements — écrans M4 et M5
// ─────────────────────────────────────────────────────────────────────────────

export const createReportSchema = z
  .object({
    targetType: reportTargetTypeSchema,
    targetId: idSchema,
    reason: reportReasonSchema,
    details: z.string().trim().min(10, 'Décris ce qui s’est passé en quelques mots.').max(2_000),
    /** Numéro du signalant s'il n'a pas de compte. */
    reporterPhone: phoneSchema.optional(),
  })
  .describe('Signalement déposé par un participant.');

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const resolveReportSchema = z.object({
  decision: z.enum(['RESOLVED', 'DISMISSED']),
  note: z
    .string()
    .trim()
    .min(10, 'Explique la décision : elle sera relue par quelqu’un d’autre.')
    .max(1_000),
});

export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

export const reportSummarySchema = z.object({
  id: idSchema,
  reference: z.string(),
  targetType: reportTargetTypeSchema,
  targetId: idSchema,
  targetLabel: z.string(),
  organizationId: idSchema.nullable(),
  organizationName: z.string().nullable(),
  reason: reportReasonSchema,
  details: z.string(),
  status: reportStatusSchema,
  reporterLabel: z.string(),
  createdAt: z.string(),
  /**
   * Fonds détenus par l'organisation visée.
   *
   * Affiché dans la liste, pas seulement dans le détail : c'est ce qui décide
   * de l'ordre de traitement. Un signalement pour fraude sur une organisation
   * qui détient deux millions passe avant tout le reste.
   */
  organizationBalance: z.number().int().nullable(),
});

export type ReportSummary = z.infer<typeof reportSummarySchema>;

/** Libellés des motifs, pour l'affichage. */
export const REPORT_REASON_LABELS = {
  FRAUD: 'Fraude',
  FALSE_INFO: 'Information trompeuse',
  INAPPROPRIATE: 'Contenu inapproprié',
  NO_SHOW: 'Événement non tenu',
  OTHER: 'Autre',
} as const;

export const REPORT_STATUS_LABELS = {
  NEW: 'Nouveau',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Traité',
  DISMISSED: 'Classé sans suite',
} as const;

/**
 * Priorité d'un signalement.
 *
 * ── Ce que le tri optimise ────────────────────────────────────────────────
 * Le risque financier, pas l'ancienneté. Un signalement pour fraude déposé il y
 * a une heure sur une organisation détenant un million passe avant un
 * « contenu inapproprié » vieux de trois jours : le premier peut encore être
 * arrêté avant un versement, le second non.
 */
export function reportPriority(input: {
  reason: z.infer<typeof reportReasonSchema>;
  organizationBalance: number | null;
}): number {
  const reasonWeight = input.reason === 'FRAUD' ? 100 : input.reason === 'NO_SHOW' ? 60 : 20;

  // Le solde compte, mais ne doit pas écraser le motif : un plafonnement évite
  // qu'une grosse organisation monopolise le haut de la file pour un
  // signalement mineur.
  const balanceWeight = Math.min(50, Math.floor((input.organizationBalance ?? 0) / 100_000));

  return reasonWeight + balanceWeight;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gel des fonds — écran M6
// ─────────────────────────────────────────────────────────────────────────────

export const freezeFundsSchema = z.object({
  /** Absent = geler tout le solde disponible. */
  amount: z.number().int().positive().optional(),
  reason: z
    .string()
    .trim()
    .min(10, 'Le motif du gel sera lu par l’organisateur : sois explicite.')
    .max(500),
  /** Dossier de signalement à l'origine du gel, s'il y en a un. */
  reportId: idSchema.optional(),
});

export type FreezeFundsInput = z.infer<typeof freezeFundsSchema>;

export const unfreezeFundsSchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().trim().min(10, 'Explique pourquoi le gel est levé.').max(500),
});

export type UnfreezeFundsInput = z.infer<typeof unfreezeFundsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Tableau de bord — écran M1
// ─────────────────────────────────────────────────────────────────────────────

export const adminDashboardSchema = z.object({
  /** Ce qui attend une décision humaine. */
  pendingEvents: z.number().int(),
  pendingVerifications: z.number().int(),
  openReports: z.number().int(),
  pendingPayouts: z.number().int(),
  /** Montant total en attente de versement, pour dimensionner la trésorerie. */
  pendingPayoutAmount: z.number().int(),
  frozenAmount: z.number().int(),
  /** Activité des dernières vingt-quatre heures. */
  ordersLast24h: z.number().int(),
  revenueLast24h: z.number().int(),
  failedPaymentsLast24h: z.number().int(),

  /**
   * Indicateurs de plateforme, sous la file d'action.
   *
   * Volontairement peu nombreux et jamais seuls en tête d'écran : le tableau
   * de bord reste d'abord une liste de décisions à prendre, pas un tableau de
   * bord commercial. Ces chiffres répondent à « comment va la plateforme dans
   * l'ensemble », une question différente de « qu'est-ce qui m'attend ».
   */
  totalOrganizations: z.number().int(),
  verifiedOrganizations: z.number().int(),
  totalGrossVolume: z.number().int(),
  eventsPublishedThisMonth: z.number().int(),
});

export type AdminDashboard = z.infer<typeof adminDashboardSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Modération des événements — écran M2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Décision sur un événement en attente de revue.
 *
 * ── Pourquoi cette revue existe ────────────────────────────────────────────
 * Le PREMIER événement d'une organisation passe par un contrôle humain, même
 * quand l'organisation est vérifiée. C'est la barrière la plus efficace contre
 * les faux événements : elle coûte une lecture de deux minutes, et un
 * escroc n'atteint jamais le stade où il encaisse.
 *
 * Une organisation vérifiée qui a déjà publié n'y repasse plus — on ne freine
 * pas l'activité établie, on contrôle l'entrée.
 */
export const reviewEventSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    /**
     * Motif du refus, envoyé à l'organisateur.
     *
     * Obligatoire pour un refus : « refusé » sans explication produit un second
     * événement identique, puis un appel au support. L'organisateur doit savoir
     * quoi corriger.
     */
    note: z.string().trim().max(1_000).optional(),
  })
  .refine((input) => input.decision === 'APPROVE' || (input.note?.length ?? 0) >= 10, {
    message: 'Explique ce qui ne va pas : l’organisateur ne verra que ce message.',
    path: ['note'],
  });

export type ReviewEventInput = z.infer<typeof reviewEventSchema>;

export const pendingEventSchema = z.object({
  id: idSchema,
  title: z.string(),
  slug: z.string(),
  startsAt: z.string(),
  submittedAt: z.string(),
  organizationId: idSchema,
  organizationName: z.string(),
  /** Une organisation vérifiée a déjà fourni ses pièces : la revue est plus rapide. */
  organizationVerified: z.boolean(),
  cityName: z.string().nullable(),
  venueName: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  /** Nombre de catégories de billets et prix le plus bas, pour juger la cohérence. */
  ticketTypeCount: z.number().int(),
  lowestPrice: z.number().int().nullable(),
  /** Premier événement de cette organisation ? Le cas le plus à risque. */
  isFirstEvent: z.boolean(),
});

export type PendingEvent = z.infer<typeof pendingEventSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Organisations — vue plateforme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce que l'administration doit pouvoir voir d'une organisation.
 *
 * ── Pourquoi ce n'était pas déjà exposé ───────────────────────────────────
 * Trois écrans en montraient chacun une TRANCHE — la fiche de vérification,
 * la fiche d'un événement en attente, un signalement — mais aucun n'offrait
 * de parcourir les organisations pour elles-mêmes. Geler un compte n'était
 * possible qu'en passant par un signalement déjà ouvert contre lui.
 */
export const organizationAdminSummarySchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string(),
  type: organizationTypeSchema,
  verificationStatus: verificationStatusSchema,
  payoutFrozen: z.boolean(),
  eventsCount: z.number().int(),
  /** Solde total du grand livre — disponible et bloqué confondus. */
  balance: z.number().int(),
  createdAt: z.string(),
});

export type OrganizationAdminSummary = z.infer<typeof organizationAdminSummarySchema>;

export const organizationAdminDetailSchema = organizationAdminSummarySchema.extend({
  legalName: z.string().nullable(),
  cityName: z.string().nullable(),
  ownerName: z.string(),
  ownerPhone: z.string(),
  ownerEmail: z.string().nullable(),
  membersCount: z.number().int(),
  completedEventsCount: z.number().int(),
});

export type OrganizationAdminDetail = z.infer<typeof organizationAdminDetailSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Utilisateurs — vue plateforme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un compte, acheteur ou organisateur — le même modèle porte les deux.
 *
 * ── Pourquoi une seule liste plutôt que deux ──────────────────────────────
 * `User` ne distingue pas structurellement un acheteur d'un organisateur :
 * c'est l'appartenance à une organisation qui fait la différence, pas un
 * champ. Scinder l'écran en « acheteurs » et « organisateurs » obligerait à
 * chercher un même compte à deux endroits selon son activité du moment.
 */
export const adminUserSummarySchema = z.object({
  id: idSchema,
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  globalRole: globalRoleSchema,
  status: userStatusSchema,
  organizationsCount: z.number().int(),
  createdAt: z.string(),
});

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserDetailSchema = adminUserSummarySchema.extend({
  suspendedReason: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  organizations: z.array(z.object({ id: idSchema, name: z.string(), role: z.string() })),
  ordersCount: z.number().int(),
});

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const suspendUserSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Explique la raison : elle sera consultable dans le journal d’audit.')
    .max(500),
});

export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Retraits — vue plateforme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un retrait, identifié par son organisation.
 *
 * `Payout` (côté organisateur) n'a pas besoin de porter l'organisation : elle
 * est déjà le contexte de la requête. Vu de l'administration, où un même
 * écran mélange les demandes de toutes les organisations, c'est l'inverse.
 */
export const adminPayoutSummarySchema = payoutSchema.extend({
  organizationId: idSchema,
  organizationName: z.string(),
});

export type AdminPayoutSummary = z.infer<typeof adminPayoutSummarySchema>;

export const listPayoutsQuerySchema = z.object({
  status: payoutStatusSchema.optional(),
});

export type ListPayoutsQuery = z.infer<typeof listPayoutsQuerySchema>;
