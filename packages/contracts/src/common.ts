/**
 * Schémas de validation transverses, réutilisés par tous les modules.
 */

import { z } from 'zod';
import {
  CURRENCY_CODES,
  isValidSlug,
  tryNormalizeInternationalPhone,
  tryNormalizePhone,
} from '@nexakabi/utils';

/** Identifiant technique (CUID2 / UUID). Opaque : jamais interprété côté client. */
export const idSchema = z.string().min(8).max(64);

/**
 * Numéro de téléphone. Le schéma NORMALISE en E.164 pendant la validation.
 *
 * Multi-pays : un numéro qui annonce son indicatif (`+221 77…`) suit la règle
 * de son pays ; un numéro sans indicatif est béninois — l'ancien format à
 * 8 chiffres ressort au nouveau format. Les utilisateurs ne sont pas
 * forcément béninois : un participant sénégalais se connecte avec son +221.
 * Voir docs/PROJECT_ANALYSIS.md §8, ambiguïté A2.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = tryNormalizeInternationalPhone(value, tryNormalizePhone);
    if (normalized === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Numéro de téléphone invalide',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const emailSchema = z.string().trim().toLowerCase().email('Adresse e-mail invalide');

export const slugSchema = z.string().refine(isValidSlug, {
  message: 'Slug invalide : minuscules, chiffres et tirets uniquement',
});

/**
 * Montant monétaire : entier, jamais négatif dans une saisie utilisateur.
 * Les montants signés du grand livre utilisent `signedAmountSchema`.
 */
export const amountSchema = z
  .number()
  .int('Un montant doit être un entier (le FCFA n’a pas de sous-unité)')
  .min(0, 'Un montant ne peut pas être négatif');

export const signedAmountSchema = z.number().int();

/**
 * Date transmise en chaîne ISO 8601, convertie en `Date` à la validation.
 *
 * `z.coerce.date()` serait plus court mais n'est pas représentable en JSON
 * Schema : la documentation OpenAPI ne peut alors plus être générée. Une API
 * JSON transporte de toute façon des chaînes, pas des objets `Date`.
 */
export const isoDateSchema = z.iso
  .datetime({ offset: true, local: true })
  .transform((value) => new Date(value));

/**
 * Devise d'un montant. Le Bénin reste le défaut ; chaque pays actif porte la
 * sienne, et c'est le pays de l'événement qui la fixe pour toute la chaîne.
 */
export const currencySchema = z.enum(CURRENCY_CODES).default('XOF');

/** Code à 6 chiffres envoyé par SMS ou WhatsApp. */
export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres');

export const orderReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^NK-[0-9A-F]{6}$/, 'Référence de commande invalide');

export const ticketReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^NK-[0-9A-F]{6}-\d{2}$/, 'Référence de billet invalide');

/** Jeton public (accès invité à un billet, invitation d'équipe). */
export const publicTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/, 'Jeton invalide');

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  { page, pageSize }: PaginationQuery,
): PaginatedResult<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Réponse d'erreur normalisée
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format d'erreur unique de l'API.
 *
 * `message` est destiné à l'utilisateur final et rédigé en français ; il ne
 * contient jamais de code brut seul. Le prototype impose de toujours donner la
 * cause probable et, quand c'est possible, une action de sortie.
 */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  /** Erreurs de validation, indexées par chemin de champ. */
  fields: z.record(z.string(), z.array(z.string())).optional(),
  /** Référence de corrélation, à communiquer au support. */
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
