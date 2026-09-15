/**
 * Contrat d'authentification.
 *
 * L'identifiant est le NUMÉRO DE TÉLÉPHONE, la preuve est un code à 6 chiffres.
 * Aucun mot de passe pour les participants, les organisateurs et les
 * contrôleurs. Voir docs/TECHNICAL_ARCHITECTURE.md §5.3.
 */

import { z } from 'zod';
import { emailSchema, idSchema, otpCodeSchema, phoneSchema } from './common.js';
import { globalRoleSchema, otpChannelSchema, userStatusSchema } from './enums.js';

// ─────────────────────────────────────────────────────────────────────────────
// Durées de référence
// ─────────────────────────────────────────────────────────────────────────────

/** Durée de vie du code à 6 chiffres. */
export const OTP_TTL_SECONDS = 5 * 60;
/** Délai avant de proposer le repli WhatsApp, valeur du prototype. */
export const OTP_WHATSAPP_FALLBACK_SECONDS = 45;
/** Délai avant de pouvoir demander un nouveau code — « Nouveau code dans 0:42 ». */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Tentatives de saisie avant invalidation du défi. */
export const OTP_MAX_ATTEMPTS = 5;
/** Demandes de code autorisées par numéro et par fenêtre. */
export const OTP_MAX_REQUESTS_PER_PHONE = 3;
export const OTP_REQUEST_WINDOW_SECONDS = 15 * 60;

/** Durée de vie du jeton d'accès. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Durée de la session sur l'appareil — « la session dure 90 jours ». */
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

// ─────────────────────────────────────────────────────────────────────────────
// Demande de code
// ─────────────────────────────────────────────────────────────────────────────

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  /** Canal souhaité. Le repli WhatsApp est proposé après 45 s sans validation. */
  channel: otpChannelSchema.default('SMS'),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

/**
 * Réponse volontairement identique que le numéro soit connu ou non :
 * révéler l'existence d'un compte permettrait de l'énumérer.
 */
export const requestOtpResponseSchema = z.object({
  /** Instant à partir duquel un nouveau code peut être demandé. */
  resendAt: z.string(),
  expiresAt: z.string(),
  channel: otpChannelSchema,
  /** Numéro masqué, pour confirmer à l'utilisateur où le code a été envoyé. */
  maskedPhone: z.string(),
  /**
   * Code en clair, UNIQUEMENT hors production et lorsque le fournisseur SMS est
   * simulé. Permet de développer sans dépendre d'un opérateur.
   */
  devCode: z.string().optional(),
});

export type RequestOtpResponse = z.infer<typeof requestOtpResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Vérification
// ─────────────────────────────────────────────────────────────────────────────

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const sessionUserSchema = z.object({
  id: idSchema,
  phone: z.string(),
  email: z.string().nullable(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  globalRole: globalRoleSchema,
  status: userStatusSchema,
  marketingOptIn: z.boolean(),
  /** Vrai tant que le nom n'a pas été renseigné : l'étape 3 reste à faire. */
  needsProfileCompletion: z.boolean(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshTokenExpiresAt: z.string(),
  user: sessionUserSchema,
  /** Vrai si le compte vient d'être créé par cette vérification. */
  isNewAccount: z.boolean(),
});

export type Session = z.infer<typeof sessionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Rafraîchissement et déconnexion
// ─────────────────────────────────────────────────────────────────────────────

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(20),
});

export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(20),
  /** Déconnecte tous les appareils, et pas seulement celui-ci. */
  allDevices: z.boolean().default(false),
});

export type LogoutInput = z.infer<typeof logoutSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Profil
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Étape 3 de l'inscription — « Comment t'appelles-tu ? Deux champs, c'est tout ».
 * Elle n'apparaît pas pendant un achat : les coordonnées saisies pour le billet
 * créent le compte automatiquement.
 */
export const completeProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Indique ton nom complet').max(120),
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  marketingOptIn: z.boolean().default(false),
});

export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;

export const updateProfileSchema = completeProfileSchema.partial().extend({
  avatarUrl: z.string().url().nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Appareils
// ─────────────────────────────────────────────────────────────────────────────

export const deviceSchema = z.object({
  id: idSchema,
  label: z.string().nullable(),
  lastUsedAt: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  /** Vrai pour l'appareil qui a émis la requête en cours. */
  isCurrent: z.boolean(),
});

export type DeviceSummary = z.infer<typeof deviceSchema>;
