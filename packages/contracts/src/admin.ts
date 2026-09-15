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
// Espaces et niveaux d'accès
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les espaces de la console — un par file de travail.
 *
 * ── Deux rôles, et des cases ────────────────────────────────────────────────
 * Le PROPRIÉTAIRE voit tout et compose l'équipe. Un EMPLOYÉ n'a que ce que le
 * propriétaire lui a coché, espace par espace, à l'un de deux niveaux :
 *   · \`read\` — il consulte, il ne décide pas ;
 *   · \`act\`  — il décide (valider un dossier, résoudre un signalement…).
 *
 * L'ARGENT n'est jamais impliqué par un espace : exécuter ou enregistrer un
 * retrait, geler ou dégeler des fonds, exigent le droit \`canMoveMoney\`,
 * accordé explicitement. Un comptable peut ainsi lire les retraits sans
 * pouvoir en déclencher un ; un modérateur décide sur les événements sans
 * jamais voir une pièce d'identité.
 */
export const ADMIN_SPACES = [
  {
    key: 'events',
    label: 'Événements',
    description: 'Relecture des premiers événements avant leur mise en ligne.',
  },
  {
    key: 'verifications',
    label: 'Vérifications',
    description: 'Dossiers d’identité des organisateurs — pièces comprises.',
  },
  {
    key: 'reports',
    label: 'Signalements',
    description: 'Contenus et comptes signalés par les participants.',
  },
  {
    key: 'organizations',
    label: 'Organisations',
    description: 'Fiches des organisateurs, journal d’activité, gel des recettes.',
  },
  {
    key: 'users',
    label: 'Utilisateurs',
    description: 'Comptes de la plateforme, suspension et réactivation.',
  },
  {
    key: 'payouts',
    label: 'Retraits',
    description: 'Demandes de retrait des organisateurs et leur exécution.',
  },
] as const;

export type AdminSpace = (typeof ADMIN_SPACES)[number]['key'];

export const ADMIN_SPACE_KEYS = ADMIN_SPACES.map((space) => space.key) as [
  AdminSpace,
  ...AdminSpace[],
];

export const adminSpaceSchema = z.enum(ADMIN_SPACE_KEYS);

export const ADMIN_ACCESS_LEVELS = ['read', 'act'] as const;
export type AdminAccessLevel = (typeof ADMIN_ACCESS_LEVELS)[number];
export const adminAccessLevelSchema = z.enum(ADMIN_ACCESS_LEVELS);

/** Ce qu'un employé peut faire, espace par espace. Un espace absent : aucun accès. */
// `partialRecord` : un espace absent signifie « aucun accès », pas une erreur.
export const adminAccessSchema = z.partialRecord(adminSpaceSchema, adminAccessLevelSchema);
export type AdminAccess = Partial<Record<AdminSpace, AdminAccessLevel>>;

/** Rôle tel que la console le lit. */
export const adminRoleSchema = z.enum(['OWNER', 'STAFF']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const ADMIN_ROLE_LABELS: Readonly<Record<AdminRole, string>> = {
  OWNER: 'Propriétaire',
  STAFF: 'Employé',
};

/**
 * Le droit sur un espace, tel que le garde et l'écran le calculent — le même
 * calcul des deux côtés, sinon un menu montrerait ce que l'API refuse.
 */
export function hasAdminAccess(
  admin: { role: AdminRole; access: AdminAccess },
  space: AdminSpace,
  level: AdminAccessLevel = 'read',
): boolean {
  if (admin.role === 'OWNER') return true;

  const held = admin.access[space];
  if (!held) return false;

  return level === 'read' || held === 'act';
}

export function canMoveMoney(admin: { role: AdminRole; canMoveMoney: boolean }): boolean {
  return admin.role === 'OWNER' || admin.canMoveMoney;
}

// ─────────────────────────────────────────────────────────────────────────────
// Identifiants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format de l'identifiant : \`nom.owner@7k2p\` ou \`nom.staff@7k2p\`.
 *
 * Le \`nom\` est choisi à la création — un prénom, un pseudo, en minuscules
 * sans accent. Le suffixe est tiré au hasard : deux « awa » peuvent coexister,
 * et l'identifiant complet est ce que l'employé tape pour se connecter.
 */
export const ADMIN_HANDLE_PATTERN = /^[a-z][a-z0-9-]{1,23}$/;
export const ADMIN_SUFFIX_LENGTH = 4;
export const ADMIN_USERNAME_PATTERN = /^[a-z][a-z0-9-]{1,23}\.(owner|staff)@[a-z0-9]{4}$/;

export const adminHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    ADMIN_HANDLE_PATTERN,
    'Lettres minuscules, chiffres et tirets seulement, de 2 à 24 caractères, en commençant par une lettre.',
  );

export function buildAdminUsername(handle: string, role: AdminRole, suffix: string): string {
  return `${handle}.${role === 'OWNER' ? 'owner' : 'staff'}@${suffix}`;
}

/** Douze caractères au minimum : un mot de passe court n'est protégé par rien d'autre. */
export const adminPasswordSchema = z
  .string()
  .min(12, 'Douze caractères au minimum.')
  .max(200, 'Deux cents caractères au maximum.');

// ─────────────────────────────────────────────────────────────────────────────
// Authentification
// ─────────────────────────────────────────────────────────────────────────────

/** Ouverture de session : identifiant et mot de passe, en une étape. */
export const adminLoginSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'L’identifiant est obligatoire.')
    .max(60, 'Cet identifiant est trop long.'),
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/** L'administrateur connecté, tel que la console le voit. */
export const adminMeSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  username: z.string(),
  role: adminRoleSchema,
  access: adminAccessSchema,
  canMoveMoney: z.boolean(),
});

export type AdminMe = z.infer<typeof adminMeSchema>;

export const adminSessionSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  user: adminMeSchema,
});

export type AdminSession = z.infer<typeof adminSessionSchema>;

/** Changement de son propre mot de passe. L'ancien est exigé : une session volée ne suffit pas. */
export const changeAdminPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Le mot de passe actuel est obligatoire.'),
    newPassword: adminPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Le nouveau mot de passe doit être différent de l’actuel.',
    path: ['newPassword'],
  });

export type ChangeAdminPasswordInput = z.infer<typeof changeAdminPasswordSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Équipe — écran du propriétaire
// ─────────────────────────────────────────────────────────────────────────────

export const adminStaffMemberSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  username: z.string(),
  role: adminRoleSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  access: adminAccessSchema,
  canMoveMoney: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export type AdminStaffMember = z.infer<typeof adminStaffMemberSchema>;

export const createAdminStaffSchema = z.object({
  fullName: z.string().trim().min(2, 'Indique le nom.').max(120),
  handle: adminHandleSchema,
  password: adminPasswordSchema,
  access: adminAccessSchema.default({}),
  canMoveMoney: z.boolean().default(false),
});

export type CreateAdminStaffInput = z.infer<typeof createAdminStaffSchema>;

export const updateAdminStaffSchema = z.object({
  fullName: z.string().trim().min(2, 'Indique le nom.').max(120).optional(),
  access: adminAccessSchema.optional(),
  canMoveMoney: z.boolean().optional(),
});

export type UpdateAdminStaffInput = z.infer<typeof updateAdminStaffSchema>;

export const resetAdminStaffPasswordSchema = z.object({
  password: adminPasswordSchema,
});

export type ResetAdminStaffPasswordInput = z.infer<typeof resetAdminStaffPasswordSchema>;

export const setAdminStaffStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export type SetAdminStaffStatusInput = z.infer<typeof setAdminStaffStatusSchema>;

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
