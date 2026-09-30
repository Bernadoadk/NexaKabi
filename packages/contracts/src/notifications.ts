/**
 * Contrat des notifications.
 *
 * ── Cinq types, et chacun a été demandé ─────────────────────────────────────
 * Le prototype est catégorique : « aucune notification promotionnelle non
 * sollicitée ». Chaque type ci-dessous correspond à quelque chose que le
 * participant a demandé — en achetant, en suivant un organisateur, en
 * choisissant ses goûts — et chacun porte une action.
 *
 * `RECOMMENDATION`, le cinquième, n'existe que pour qui l'a demandé : il est
 * INACTIF par défaut, et la case qui l'active n'est jamais précochée. C'est la
 * différence entre une sélection qu'on attend et une publicité qu'on subit.
 * La liste reste fermée : un sixième type serait la première marche vers le
 * centre de notifications que personne n'ouvre.
 */

import { z } from 'zod';
import { idSchema } from './common.js';
import { notificationTypeSchema, type NotificationType } from './enums.js';

/**
 * Les types vivent dans `enums.js`, avec le reste des énumérations partagées.
 * Ce fichier ne les redéfinit pas : il leur donne des libellés, des règles et
 * des messages.
 */
export const NOTIFICATION_LABELS: Readonly<Record<NotificationType, string>> = {
  PAYMENT_CONFIRMED: 'Paiement confirmé',
  EVENT_REMINDER: 'Rappel d’événement',
  EVENT_UPDATED: 'Information modifiée',
  ORGANIZER_PUBLISHED: 'Nouvel événement',
  RECOMMENDATION: 'Pour toi',
};

export const notificationSchema = z.object({
  id: idSchema,
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  /** Où mène la notification. Toujours renseigné : une notification sans
   *  action est un bruit qu'on apprend à ignorer. */
  actionUrl: z.string(),
  actionLabel: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export type Notification = z.infer<typeof notificationSchema>;

/**
 * Préférences, par type.
 *
 * ── Ce qui ne se désactive pas ──────────────────────────────────────────────
 * `PAYMENT_CONFIRMED` et `EVENT_UPDATED` sont transactionnels : ils portent une
 * information que le participant DOIT recevoir — son billet, ou une annulation.
 * Les rendre optionnels reviendrait à laisser quelqu'un se présenter devant une
 * salle fermée.
 */
export const MANDATORY_TYPES: readonly NotificationType[] = ['PAYMENT_CONFIRMED', 'EVENT_UPDATED'];

export function isMandatory(type: NotificationType): boolean {
  return MANDATORY_TYPES.includes(type);
}

/**
 * Réglages du participant.
 *
 * ── Les défauts, et ce qu'ils disent ────────────────────────────────────────
 *  · Rappels : ACTIFS. Ils rendent service à quelqu'un qui a déjà payé.
 *  · Organisateurs suivis : ACTIFS. Suivre un organisateur EST la demande —
 *    un suivi muet par défaut serait un bouton qui ne fait rien.
 *  · Sélection selon les goûts : INACTIVE. C'est le seul type que rien, dans
 *    ce que le participant a fait, ne réclame : il doit l'avoir demandé.
 *
 * Canaux : l'application est toujours active et n'a donc pas de champ. Les
 * notifications sur l'appareil (push) n'en ont pas non plus : elles dépendent
 * d'une autorisation du navigateur, donnée appareil par appareil — voir
 * `pushSubscriptionInputSchema`.
 */
export const notificationPreferencesSchema = z.object({
  eventReminders: z.boolean().default(true),
  organizerPublications: z.boolean().default(true),
  recommendations: z.boolean().default(false),
  whatsapp: z.boolean().default(true),
  /** Secours des messages critiques seulement (billet, annulation) : un SMS coûte à chaque envoi. */
  sms: z.boolean().default(true),
  email: z.boolean().default(false),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/**
 * Modification des réglages : seuls les champs envoyés changent.
 *
 * ── Pourquoi pas `notificationPreferencesSchema.partial()` ──────────────────
 * Zod 4 applique les valeurs par défaut même à un champ rendu facultatif :
 * `{ sms: false }` ressortait complété de TOUS les défauts, et basculer les
 * SMS remettait l'e-mail à « non » sans que personne l'ait demandé. Un
 * correctif ne doit porter que ce qui a bougé — d'où ce schéma, sans défauts.
 */
export const updateNotificationPreferencesSchema = z
  .object({
    eventReminders: z.boolean(),
    organizerPublications: z.boolean(),
    recommendations: z.boolean(),
    whatsapp: z.boolean(),
    sms: z.boolean(),
    email: z.boolean(),
  })
  .partial();

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

/** Valeurs appliquées tant que le participant n'a rien réglé. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences =
  notificationPreferencesSchema.parse({});

/**
 * Échéances de rappel, en heures avant le début.
 *
 * J-7 pour s'organiser, J-1 pour ne pas oublier, H-3 pour partir à temps. Au
 * Bénin, la circulation de fin d'après-midi à Cotonou justifie à elle seule le
 * troisième.
 */
export const REMINDER_OFFSETS_HOURS = [168, 24, 3] as const;

/**
 * Le rappel est-il encore utile ?
 *
 * Un rappel J-7 envoyé pour un événement acheté la veille arriverait après
 * coup : il vaut mieux ne rien envoyer que d'envoyer à contretemps.
 */
export function shouldSendReminder(input: {
  startsAt: Date;
  offsetHours: number;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const target = input.startsAt.getTime() - input.offsetHours * 3_600_000;

  // Fenêtre d'une heure : le balayage tourne périodiquement, pas à la seconde.
  return now.getTime() >= target && now.getTime() < target + 3_600_000;
}

/** Message d'un rappel, en français, avec son action. */
export function buildReminderMessage(input: {
  eventTitle: string;
  offsetHours: number;
  venueName: string | null;
}): { title: string; body: string } {
  const when =
    input.offsetHours >= 168
      ? 'dans une semaine'
      : input.offsetHours >= 24
        ? 'demain'
        : 'dans quelques heures';

  return {
    title: `${input.eventTitle} — c’est ${when}`,
    body: input.venueName
      ? `Rendez-vous à ${input.venueName}. Ouvre ton billet avant de partir : il fonctionne sans réseau.`
      : 'Ouvre ton billet avant de partir : il fonctionne sans réseau.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Goûts et sélection hebdomadaire
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Goûts du participant : catégories et villes.
 *
 * Les deux listes sont facultatives. Aucune catégorie : toutes conviennent ;
 * aucune ville : partout — un événement en ligne convient toujours.
 */
export const userInterestsSchema = z.object({
  categoryIds: z.array(idSchema).max(30).default([]),
  cityIds: z.array(idSchema).max(30).default([]),
});

export type UserInterests = z.infer<typeof userInterestsSchema>;

/**
 * Une sélection par semaine, au plus.
 *
 * C'est la promesse écrite sous la case de l'inscription — « un message par
 * semaine au maximum ». Le compte se fait par participant, depuis sa dernière
 * sélection : quelqu'un qui s'inscrit un jeudi reçoit la sienne sans attendre
 * le lundi suivant.
 */
export const RECOMMENDATION_INTERVAL_DAYS = 7;

/** Événements cités dans une sélection : au-delà, on ne lit plus. */
export const RECOMMENDATION_MAX_EVENTS = 5;

/**
 * Message de la sélection, pour le centre et le téléphone.
 *
 * `total` : nombre d'événements trouvés, quand la liste des titres a été
 * écourtée — le message dit « 12 nouveaux événements » et en cite deux.
 */
export function buildRecommendationMessage(
  titles: readonly string[],
  total: number = titles.length,
): {
  title: string;
  body: string;
} {
  const count = Math.max(total, titles.length);
  const shown = titles.slice(0, 2).map((title) => `« ${title} »`);
  const rest = count - shown.length;

  return {
    title: count === 1 ? 'Un nouvel événement pour toi' : `${count} nouveaux événements pour toi`,
    body:
      rest > 0
        ? `${shown.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}, selon tes goûts.`
        : `${shown.join(' et ')}, selon tes goûts.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Organisateurs suivis
// ─────────────────────────────────────────────────────────────────────────────

export const followedOrganizationSchema = z.object({
  id: idSchema,
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  verified: z.boolean(),
  upcomingEventsCount: z.number().int(),
  followedAt: z.string(),
});

export type FollowedOrganization = z.infer<typeof followedOrganizationSchema>;

export const followStateSchema = z.object({
  following: z.boolean(),
  followersCount: z.number().int(),
});

export type FollowState = z.infer<typeof followStateSchema>;

/** Message d'une publication, pour les participants qui suivent l'organisateur. */
export function buildPublicationMessage(input: {
  organizationName: string;
  eventTitle: string;
  when: string;
  where: string | null;
}): { title: string; body: string } {
  return {
    title: `${input.organizationName} publie « ${input.eventTitle} »`,
    body: input.where ? `${input.when} · ${input.where}` : input.when,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications sur l'appareil (Web Push)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Services de notification des navigateurs.
 *
 * ── Pourquoi une liste fermée ──────────────────────────────────────────────
 * L'adresse d'un abonnement est fournie par le navigateur… donc par
 * quiconque appelle l'API. Le serveur y envoie ensuite une requête à chaque
 * notification : sans contrôle, n'importe qui lui ferait frapper à l'adresse
 * de son choix, réseau interne compris. Seuls les services réels de Chrome,
 * Firefox, Safari et Edge sont acceptés.
 */
const PUSH_SERVICE_HOSTS = [
  'googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
] as const;

export function isKnownPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return false;

    return PUSH_SERVICE_HOSTS.some(
      (suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

const pushEndpointSchema = z
  .string()
  .max(2_048)
  .refine(isKnownPushEndpoint, 'Ce service de notification n’est pas pris en charge.');

/** Abonnement tel que `PushManager.subscribe()` le rend, sérialisé en JSON. */
export const pushSubscriptionInputSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(64),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: pushEndpointSchema });

export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

/**
 * Ce que l'écran de réglages doit savoir du push.
 *
 * `publicKey` à `null` : le serveur n'a pas de clés VAPID, le push n'existe
 * pas sur cette installation — l'écran le dit au lieu de proposer un
 * interrupteur qui échouerait.
 */
export const pushStatusSchema = z.object({
  publicKey: z.string().nullable(),
  devices: z.number().int(),
});

export type PushStatus = z.infer<typeof pushStatusSchema>;
