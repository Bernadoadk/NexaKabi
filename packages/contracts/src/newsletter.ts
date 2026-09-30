/**
 * Contrat de la newsletter.
 *
 * ── Ce qu'elle est, et ce qu'elle n'est pas ─────────────────────────────────
 * Un e-mail éditorial, composé à la main depuis la console, envoyé aux seules
 * adresses qui l'ont demandé ET confirmé. Ce n'est pas une notification : elle
 * n'entre pas dans le centre du participant, et elle ne part ni par SMS ni
 * par WhatsApp, où chaque message coûte et où personne ne l'a réclamée.
 *
 * ── Le consentement, et sa preuve ───────────────────────────────────────────
 * Une adresse saisie n'est pas une adresse consentie : une faute de frappe, ou
 * la malveillance, inscrirait quelqu'un d'autre. Toute inscription passe donc
 * par un lien de confirmation (double consentement), et chaque envoi porte un
 * lien de désabonnement en un clic — exigé par Gmail et Yahoo pour tout envoi
 * en nombre, et par le simple respect de la personne.
 */

import { z } from 'zod';
import {
  emailSchema,
  idSchema,
  isoDateSchema,
  paginationQuerySchema,
  publicTokenSchema,
} from './common.js';
import {
  eventStatusSchema,
  newsletterCampaignStatusSchema,
  newsletterSourceSchema,
  newsletterSubscriberStatusSchema,
  type NewsletterCampaignStatus,
  type NewsletterSource,
  type NewsletterSubscriberStatus,
} from './enums.js';

export const NEWSLETTER_SUBSCRIBER_STATUS_LABELS: Readonly<
  Record<NewsletterSubscriberStatus, string>
> = {
  PENDING: 'À confirmer',
  ACTIVE: 'Abonné',
  UNSUBSCRIBED: 'Désabonné',
};

export const NEWSLETTER_SOURCE_LABELS: Readonly<Record<NewsletterSource, string>> = {
  SIGNUP: 'Inscription',
  ACCOUNT: 'Mon compte',
  WEBSITE: 'Formulaire du site',
};

export const NEWSLETTER_CAMPAIGN_STATUS_LABELS: Readonly<Record<NewsletterCampaignStatus, string>> =
  {
    DRAFT: 'Brouillon',
    SCHEDULED: 'Programmée',
    SENDING: 'Envoi en cours',
    SENT: 'Envoyée',
    CANCELLED: 'Arrêtée',
  };

// ─────────────────────────────────────────────────────────────────────────────
// Côté public et compte
// ─────────────────────────────────────────────────────────────────────────────

/** Formulaire du site : une adresse, rien d'autre. */
export const newsletterSubscribeSchema = z.object({ email: emailSchema });

export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>;

/** Lien de confirmation ou de désabonnement. */
export const newsletterTokenSchema = z.object({ token: publicTokenSchema });

export type NewsletterTokenInput = z.infer<typeof newsletterTokenSchema>;

/** Résultat d'un lien ouvert : l'adresse est masquée, le lien a pu être transféré. */
export const newsletterTokenResultSchema = z.object({
  status: newsletterSubscriberStatusSchema,
  maskedEmail: z.string(),
});

export type NewsletterTokenResult = z.infer<typeof newsletterTokenResultSchema>;

/** L'abonnement du participant connecté, tel que ses réglages l'affichent. */
export const accountNewsletterSchema = z.object({
  status: z.enum(['NONE', 'PENDING', 'ACTIVE', 'UNSUBSCRIBED']),
  /** Adresse de l'abonnement — celle du compte, ou une ancienne si elle a changé. */
  email: z.string().nullable(),
});

export type AccountNewsletter = z.infer<typeof accountNewsletterSchema>;

export const updateAccountNewsletterSchema = z.object({ subscribed: z.boolean() });

export type UpdateAccountNewsletterInput = z.infer<typeof updateAccountNewsletterSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Console — abonnés
// ─────────────────────────────────────────────────────────────────────────────

export const newsletterSubscriberSchema = z.object({
  id: idSchema,
  email: z.string(),
  status: newsletterSubscriberStatusSchema,
  source: newsletterSourceSchema,
  /** Compte lié, quand l'abonnement vient d'un participant connecté. */
  userName: z.string().nullable(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  unsubscribedAt: z.string().nullable(),
});

export type NewsletterSubscriber = z.infer<typeof newsletterSubscriberSchema>;

export const newsletterSubscribersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  statut: newsletterSubscriberStatusSchema.optional(),
});

export type NewsletterSubscribersQuery = z.infer<typeof newsletterSubscribersQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Console — campagnes
// ─────────────────────────────────────────────────────────────────────────────

/** Événements qu'une campagne peut mettre en avant : au-delà, l'e-mail ne se lit plus. */
export const NEWSLETTER_MAX_EVENTS = 8;

/**
 * Lien du bouton : une page du site (`/evenements`) ou une adresse HTTPS.
 *
 * Jamais `http://` : un lien en clair dans un e-mail envoyé en notre nom est
 * une invitation à l'interception.
 */
const ctaUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      (value.startsWith('/') && !value.startsWith('//')) || /^https:\/\/[^\s]+$/.test(value),
    'Indique une page du site (/evenements) ou une adresse en https://.',
  );

const campaignContentShape = {
  subject: z
    .string()
    .trim()
    .min(3, 'L’objet est trop court.')
    .max(150, 'L’objet dépasse 150 caractères : il serait coupé dans la boîte de réception.'),
  /** Texte d'aperçu, affiché après l'objet dans la boîte de réception. */
  preheader: z.string().trim().max(150).nullable().optional(),
  heading: z.string().trim().max(120).nullable().optional(),
  /** Texte brut : une ligne vide sépare deux paragraphes. Aucun HTML accepté. */
  body: z.string().max(10_000).optional(),
  ctaLabel: z.string().trim().max(40).nullable().optional(),
  ctaUrl: ctaUrlSchema.nullable().optional(),
  eventIds: z.array(idSchema).max(NEWSLETTER_MAX_EVENTS).optional(),
};

/** Un bouton sans lien, ou un lien sans bouton, ne se voit pas — les deux ou aucun. */
function ctaIsComplete(input: { ctaLabel?: string | null; ctaUrl?: string | null }): boolean {
  const hasLabel = Boolean(input.ctaLabel?.trim());
  const hasUrl = Boolean(input.ctaUrl?.trim());
  return hasLabel === hasUrl;
}

export const createNewsletterCampaignSchema = z.object(campaignContentShape).refine(ctaIsComplete, {
  message: 'Le bouton demande un libellé ET un lien.',
  path: ['ctaUrl'],
});

export type CreateNewsletterCampaignInput = z.infer<typeof createNewsletterCampaignSchema>;

export const updateNewsletterCampaignSchema = z
  .object({ ...campaignContentShape, subject: campaignContentShape.subject.optional() })
  .refine(ctaIsComplete, {
    message: 'Le bouton demande un libellé ET un lien.',
    path: ['ctaUrl'],
  });

export type UpdateNewsletterCampaignInput = z.infer<typeof updateNewsletterCampaignSchema>;

/** Envoi immédiat, ou programmé à une date future. */
export const sendNewsletterCampaignSchema = z.object({
  scheduledAt: isoDateSchema.optional(),
});

export type SendNewsletterCampaignInput = z.infer<typeof sendNewsletterCampaignSchema>;

export const testNewsletterCampaignSchema = z.object({ email: emailSchema });

export type TestNewsletterCampaignInput = z.infer<typeof testNewsletterCampaignSchema>;

/** Un événement tel que la campagne le montre, et tel que le sélecteur le propose. */
export const newsletterEventSchema = z.object({
  id: idSchema,
  slug: z.string(),
  title: z.string(),
  startsAt: z.string(),
  status: eventStatusSchema,
  organizationName: z.string(),
  cityName: z.string().nullable(),
  venueName: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  /** Prix le plus bas des billets en vente ; `null` si aucun, 0 si gratuit. */
  fromPrice: z.number().int().nullable(),
  currency: z.string(),
});

export type NewsletterEvent = z.infer<typeof newsletterEventSchema>;

export const newsletterCampaignSummarySchema = z.object({
  id: idSchema,
  subject: z.string(),
  status: newsletterCampaignStatusSchema,
  scheduledAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  recipientCount: z.number().int(),
  queuedCount: z.number().int(),
  sentCount: z.number().int(),
  failedCount: z.number().int(),
  skippedCount: z.number().int(),
  createdByName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NewsletterCampaignSummary = z.infer<typeof newsletterCampaignSummarySchema>;

export const newsletterCampaignDetailSchema = newsletterCampaignSummarySchema.extend({
  preheader: z.string().nullable(),
  heading: z.string().nullable(),
  body: z.string(),
  ctaLabel: z.string().nullable(),
  ctaUrl: z.string().nullable(),
  events: z.array(newsletterEventSchema),
  /** Dernières erreurs d'envoi, pour comprendre un taux d'échec sans ouvrir la base. */
  recentFailures: z.array(z.object({ email: z.string(), reason: z.string() })),
});

export type NewsletterCampaignDetail = z.infer<typeof newsletterCampaignDetailSchema>;

export const newsletterPreviewSchema = z.object({
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  /** Abonnés actifs à qui partirait la campagne si elle était lancée maintenant. */
  audience: z.number().int(),
});

export type NewsletterPreview = z.infer<typeof newsletterPreviewSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Console — réglages des envois
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réglages globaux des envois aux participants.
 *
 * ── Pourquoi ils existent ───────────────────────────────────────────────────
 * Les choix du participant décident de ce qu'IL accepte ; ces interrupteurs
 * décident de ce que la PLATEFORME accepte de payer. Un WhatsApp coûte à
 * chaque message : le jour où l'agrégateur est branché, couper WhatsApp pour
 * les messages non urgents — rappels, organisateurs suivis, sélection — se
 * fait ici, en un geste, sans toucher au code. Les messages critiques (billet,
 * annulation) partent toujours.
 */
export const platformNotificationSettingsSchema = z.object({
  /** Sélection hebdomadaire selon les goûts. Coupée : plus aucune n'est calculée. */
  recommendationsEnabled: z.boolean(),
  /** WhatsApp pour les messages non urgents. Coupé : seuls billets et annulations y passent. */
  whatsappForNonUrgent: z.boolean(),
});

export type PlatformNotificationSettings = z.infer<typeof platformNotificationSettingsSchema>;

export const DEFAULT_PLATFORM_NOTIFICATION_SETTINGS: PlatformNotificationSettings = {
  recommendationsEnabled: true,
  whatsappForNonUrgent: true,
};

export const updatePlatformNotificationSettingsSchema =
  platformNotificationSettingsSchema.partial();

export type UpdatePlatformNotificationSettingsInput = z.infer<
  typeof updatePlatformNotificationSettingsSchema
>;

export const newsletterOverviewSchema = z.object({
  subscribers: z.object({
    active: z.number().int(),
    pending: z.number().int(),
    unsubscribed: z.number().int(),
  }),
  campaigns: z.array(newsletterCampaignSummarySchema),
  settings: platformNotificationSettingsSchema,
  /** Participants qui ont demandé la sélection selon leurs goûts. */
  recommendationSubscribers: z.number().int(),
  /** Sélections envoyées ces sept derniers jours. */
  recommendationsLast7Days: z.number().int(),
  /** Participants qui suivent au moins un organisateur. */
  followers: z.number().int(),
  /**
   * Fournisseur d'e-mail en service : `console` n'envoie RIEN, il écrit dans
   * les journaux. La console doit le dire avant qu'on lance une campagne.
   */
  emailProvider: z.enum(['console', 'smtp']),
});

export type NewsletterOverview = z.infer<typeof newsletterOverviewSchema>;
