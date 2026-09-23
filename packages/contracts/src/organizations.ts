/**
 * Contrat des organisations et des équipes.
 *
 * Une organisation est le contenant de tout le reste. Un artiste indépendant et
 * une agence utilisent la MÊME entité, avec ou sans équipe : cela évite deux
 * produits à maintenir et permet la vérification progressive.
 */

import { z } from 'zod';
import { emailSchema, idSchema, phoneSchema, slugSchema } from './common.js';
import {
  documentTypeSchema,
  memberStatusSchema,
  organizationStatusSchema,
  organizationTypeSchema,
  orgRoleSchema,
  paymentMethodCodeSchema,
  payoutAccountTypeSchema,
  verificationStatusSchema,
} from './enums.js';
import { countryCodeSchema } from './payments.js';

/** Durée de validité d'une invitation d'équipe — valeur du prototype. */
export const INVITATION_TTL_DAYS = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Organisation
// ─────────────────────────────────────────────────────────────────────────────

const socialUrl = z.string().url('Adresse invalide').max(200).optional().or(z.literal(''));

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Le nom de l'organisation est trop court").max(120),
  type: organizationTypeSchema.default('INDIVIDUAL'),
  /**
   * Pays de l'organisation. Gouverne la devise de son grand livre, les moyens
   * de réception proposés pour ses retraits, et le pays par défaut de ses
   * événements en ligne. Absent : le pays par défaut de la plateforme.
   */
  countryCode: countryCodeSchema.optional(),
  /** Ville d'exercice. La table des villes arrive en phase 5. */
  cityName: z.string().trim().max(80).optional(),
  /** Posée par la recherche Google Maps, ajustable à la main. */
  address: z.string().trim().max(240).optional(),
  phone: phoneSchema.optional(),
  whatsapp: phoneSchema.optional(),
  email: emailSchema.optional(),
  description: z.string().trim().max(2000).optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = createOrganizationSchema.partial().extend({
  legalName: z.string().trim().max(160).optional(),
  logoUrl: z.string().url().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  website: socialUrl,
  facebook: socialUrl,
  instagram: socialUrl,
  tiktok: socialUrl,
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const organizationSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string(),
  legalName: z.string().nullable(),
  type: organizationTypeSchema,
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  website: z.string().nullable(),
  facebook: z.string().nullable(),
  instagram: z.string().nullable(),
  tiktok: z.string().nullable(),
  cityName: z.string().nullable(),
  address: z.string().nullable(),
  countryCode: countryCodeSchema,
  /** Devise du grand livre et des retraits — celle du pays. */
  currency: z.string(),
  status: organizationStatusSchema,
  verificationStatus: verificationStatusSchema,
  verifiedAt: z.string().nullable(),
  /**
   * Le gel du solde est le levier de modération de premier recours : la vente
   * continue, l'argent ne part pas.
   */
  payoutFrozen: z.boolean(),
  completedEventsCount: z.number().int(),
  createdAt: z.string(),
});

export type Organization = z.infer<typeof organizationSchema>;

/** Organisation vue depuis le sélecteur, avec le rôle de l'utilisateur. */
export const organizationSummarySchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string(),
  logoUrl: z.string().nullable(),
  /** Une personne physique n'a jamais de document à fournir — voir `DOCUMENT_TYPES`. */
  type: organizationTypeSchema,
  verificationStatus: verificationStatusSchema,
  role: orgRoleSchema,
  memberCount: z.number().int(),
});

export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Membres et invitations
// ─────────────────────────────────────────────────────────────────────────────

export const memberSchema = z.object({
  id: idSchema,
  userId: idSchema,
  fullName: z.string(),
  /** Masqué pour les rôles qui n'ont pas à voir les coordonnées complètes. */
  phone: z.string(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: orgRoleSchema,
  status: memberStatusSchema,
  scopedEventIds: z.array(z.string()),
  gate: z.string().nullable(),
  joinedAt: z.string().nullable(),
  /** Fin de l'accès, pour un contrôleur invité le temps d'un événement. */
  accessEndsAt: z.string().nullable(),
  /** Vrai pour l'utilisateur qui consulte la liste. */
  isCurrentUser: z.boolean(),
});

export type Member = z.infer<typeof memberSchema>;

/**
 * Invitation d'un membre.
 *
 * Pour un contrôleur, on choisit en plus l'événement et la porte ; il n'a alors
 * accès à rien d'autre.
 */
export const inviteMemberSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    /** Le propriétaire ne s'invite pas : il est unique et défini à la création. */
    role: z.enum(['ADMIN', 'MANAGER', 'SCANNER', 'ANALYST']),
    scopedEventIds: z.array(z.string()).default([]),
    gate: z.string().trim().max(60).optional(),
  })
  .refine((value) => Boolean(value.phone ?? value.email), {
    message: 'Indique un numéro de téléphone ou une adresse e-mail',
    path: ['phone'],
  });

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const invitationSchema = z.object({
  id: idSchema,
  organizationName: z.string(),
  organizationLogoUrl: z.string().nullable(),
  role: orgRoleSchema,
  /** Phrase compréhensible du rôle, jamais une liste de permissions. */
  roleLabel: z.string(),
  roleDescription: z.string(),
  invitedByName: z.string(),
  expiresAt: z.string(),
});

export type Invitation = z.infer<typeof invitationSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'SCANNER', 'ANALYST']),
  scopedEventIds: z.array(z.string()).optional(),
  gate: z.string().trim().max(60).nullable().optional(),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Comptes de retrait
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compte de réception d'un organisateur.
 *
 * Le moyen de réception est CHOISI parmi ceux que le pays de l'organisation
 * autorise en versement — jamais déduit du moyen qu'un participant a utilisé
 * pour payer. Le numéro est validé côté serveur contre la règle du pays.
 */
export const createPayoutAccountSchema = z
  .object({
    type: payoutAccountTypeSchema,
    /** Moyen de réception : `mtn_momo`, `wave`, `bank_transfer`… */
    methodCode: paymentMethodCodeSchema,
    accountNumber: z.string().trim().min(4).max(40),
    accountHolderName: z.string().trim().min(2).max(120),
    bankName: z.string().trim().max(120).optional(),
    isDefault: z.boolean().default(false),
  })
  .refine((value) => value.type !== 'BANK' || Boolean(value.bankName), {
    message: 'Précise la banque',
    path: ['bankName'],
  })
  .refine((value) => value.type !== 'BANK' || value.methodCode === 'bank_transfer', {
    message: 'Un compte bancaire reçoit par virement',
    path: ['methodCode'],
  })
  .refine((value) => value.type !== 'MOBILE_MONEY' || value.methodCode !== 'bank_transfer', {
    message: 'Choisis un opérateur Mobile Money',
    path: ['methodCode'],
  });

export type CreatePayoutAccountInput = z.infer<typeof createPayoutAccountSchema>;

export const payoutAccountSchema = z.object({
  id: idSchema,
  type: payoutAccountTypeSchema,
  countryCode: countryCodeSchema,
  currency: z.string(),
  methodCode: paymentMethodCodeSchema,
  /** Libellé du moyen : « MTN MoMo », « Virement bancaire ». */
  methodLabel: z.string(),
  /**
   * Vrai si le pays autorise encore ce moyen en versement. Un compte peut
   * survivre à une désactivation : il reste visible, mais plus utilisable.
   */
  payoutAvailable: z.boolean(),
  /** Numéro masqué : seuls les derniers caractères sont exposés. */
  maskedAccountNumber: z.string(),
  accountHolderName: z.string(),
  bankName: z.string().nullable(),
  isDefault: z.boolean(),
  verifiedAt: z.string().nullable(),
  lastFailureReason: z.string().nullable(),
});

export type PayoutAccount = z.infer<typeof payoutAccountSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Vérification
// ─────────────────────────────────────────────────────────────────────────────

export const submitVerificationSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  contactPhone: phoneSchema,
});

export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

/**
 * Paramètres d'URL du dépôt d'une pièce — le corps de la requête est le
 * fichier lui-même.
 *
 * `consent` accompagne obligatoirement une pièce personnelle : le Code du
 * numérique béninois exige un consentement exprès pour l'image du visage, et
 * un consentement qu'on ne peut pas prouver n'a jamais existé. La version est
 * celle de `IDENTITY_CONSENT`, pour savoir un jour à quel texte l'organisateur a
 * dit oui.
 */
export const uploadVerificationDocumentSchema = z.object({
  type: documentTypeSchema,
  consent: z.coerce.number().int().positive().optional(),
});

export type UploadVerificationDocumentInput = z.infer<typeof uploadVerificationDocumentSchema>;

/**
 * Les trois contrôles qui décident d'une vérification.
 * Tout le reste — site web, réseaux sociaux, historique — est indicatif et
 * n'entre pas dans la décision.
 */
export const verificationChecksSchema = z.object({
  idMatchesPayoutAccount: z.boolean(),
  phoneVerifiedByCode: z.boolean(),
  legalDocumentValid: z.boolean(),
});

export type VerificationChecks = z.infer<typeof verificationChecksSchema>;

export const verificationRequestSchema = z.object({
  id: idSchema,
  status: verificationStatusSchema,
  contactName: z.string(),
  contactPhone: z.string(),
  submittedAt: z.string(),
  reviewedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  checks: verificationChecksSchema.nullable(),
  /**
   * Les pièces qu'un modérateur a explicitement réclamées.
   *
   * Vide dans le cas normal — et c'est le cas normal : rien n'est demandé tant
   * qu'un doute n'a pas été formulé. Non vide, cette liste est le seul titre
   * qui autorise le dépôt : l'API refuse toute pièce qui n'y figure pas.
   */
  requestedDocuments: z.array(documentTypeSchema),
  documents: z.array(
    z.object({
      id: idSchema,
      type: documentTypeSchema,
      fileName: z.string().nullable(),
      status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
      rejectionReason: z.string().nullable(),
      createdAt: z.string(),
      /** Faux quand le fichier a été détruit après décision — la trace reste. */
      available: z.boolean(),
    }),
  ),
});

export type VerificationRequestDetail = z.infer<typeof verificationRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Journal d'activité
// ─────────────────────────────────────────────────────────────────────────────

export const activityEntrySchema = z.object({
  id: idSchema,
  action: z.string(),
  actorName: z.string().nullable(),
  entityType: z.string(),
  entityId: z.string(),
  createdAt: z.string(),
  /** Phrase lisible : « a modifié le quota du Pass Standard ». */
  summary: z.string(),
});

export type ActivityEntry = z.infer<typeof activityEntrySchema>;
