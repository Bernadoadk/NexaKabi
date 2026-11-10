/**
 * Contrat des notifications.
 *
 * ── Une liste fermée, et la règle qui l'ouvre ───────────────────────────────
 * Le prototype est catégorique : « aucune notification promotionnelle non
 * sollicitée ». Un type n'entre donc dans la liste que s'il répond à quelque
 * chose que son destinataire a demandé — en achetant, en suivant un
 * organisateur, en choisissant ses goûts, en vendant des billets — et s'il
 * porte une action. La liste est fermée parce que chaque ajout dilue les
 * suivants : c'est la première marche vers le centre de notifications que
 * personne n'ouvre.
 *
 * Onze types à ce jour, en deux publics :
 *  · le PARTICIPANT — paiement, rappel, changement ou annulation, publication
 *    d'un organisateur suivi, sélection, et remboursement effectué ;
 *  · l'ORGANISATION — une vente, un événement complet, la décision de la
 *    modération, celle de la vérification, l'issue d'un retrait. Un organisateur
 *    qui vend des billets demande, par là même, à savoir qu'ils se vendent : ce
 *    n'est pas de la promotion, c'est le tableau de bord qui vient à lui.
 *
 * `RECOMMENDATION` n'existe que pour qui l'a demandé : il est INACTIF par
 * défaut, et la case qui l'active n'est jamais précochée. C'est la différence
 * entre une sélection qu'on attend et une publicité qu'on subit.
 */

import { z } from 'zod';
import { idSchema } from './common.js';
import { NOTIFICATION_TYPES, notificationTypeSchema, type NotificationType } from './enums.js';

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
  REFUND_COMPLETED: 'Remboursement effectué',
  SALE_RECEIVED: 'Nouvelle vente',
  SOLD_OUT: 'Complet',
  EVENT_REVIEWED: 'Décision sur un événement',
  VERIFICATION_REVIEWED: 'Vérification',
  PAYOUT_UPDATED: 'Retrait',
  SPOTLIGHT_UPDATED: 'Mise en avant',
};

// ─────────────────────────────────────────────────────────────────────────────
// Politique par type
// ─────────────────────────────────────────────────────────────────────────────

/** À qui s'adresse un type : une personne, ou les membres habilités d'une organisation. */
export type NotificationAudience = 'PARTICIPANT' | 'ORGANIZATION';

/**
 * Par le téléphone, comment ?
 *  · `critical` — WhatsApp d'abord, SMS en secours : le destinataire doit
 *    l'apprendre même sans ouvrir l'application ;
 *  · `optional` — WhatsApp seulement, s'il l'a choisi ET si la plateforme
 *    l'autorise : un message qui coûte à chaque envoi se mérite ;
 *  · `none` — jamais : l'appareil et le centre suffisent.
 */
export type PhoneMode = 'critical' | 'optional' | 'none';

export interface NotificationPolicy {
  readonly audience: NotificationAudience;
  /**
   * Ne se désactive pas : le message porte un billet, une annulation, de
   * l'argent, ou une décision qui conditionne le travail de l'organisateur.
   */
  readonly mandatory: boolean;
  /** Réveille un téléphone en économie d'énergie, et vibre plus fort. */
  readonly urgent: boolean;
  /** Reste affichée sur ordinateur jusqu'au clic, au lieu de disparaître seule. */
  readonly sticky: boolean;
  readonly phone: PhoneMode;
  /** Envoyée aussi par e-mail, quand le destinataire l'a activé. */
  readonly email: boolean;
  /**
   * Durée de conservation par le service de notification d'un message que le
   * téléphone n'a pas pu recevoir. Un rappel reçu après l'événement est pire
   * qu'un rappel perdu : chaque type porte donc sa propre échéance.
   */
  readonly ttlSeconds: number;
  /** Sans son ni vibration la nuit (heure de Porto-Novo) : elle s'affiche, elle ne réveille pas. */
  readonly quietAtNight: boolean;
  /**
   * Une notification de même étiquette, déjà poussée depuis moins de N secondes,
   * n'est pas repoussée — la ligne du centre, elle, se met à jour. Une rafale de
   * ventes fait sonner le téléphone une fois, pas cinquante.
   */
  readonly coalesceSeconds: number;
}

const HOUR = 3_600;

/**
 * La table, exhaustive par construction : un nouveau type qui n'y figure pas
 * ne compile pas.
 *
 * Les cinq premières lignes reproduisent à l'identique ce que le code décidait
 * jusqu'ici avec `isMandatory` : critique = mandatory + urgent + téléphone.
 */
export const NOTIFICATION_POLICY: Readonly<Record<NotificationType, NotificationPolicy>> = {
  PAYMENT_CONFIRMED: {
    audience: 'PARTICIPANT',
    mandatory: true,
    urgent: true,
    sticky: false,
    phone: 'critical',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: false,
    coalesceSeconds: 0,
  },
  EVENT_REMINDER: {
    audience: 'PARTICIPANT',
    mandatory: false,
    urgent: false,
    sticky: false,
    phone: 'optional',
    email: true,
    // Le plus court des rappels (H-3) n'a plus de sens une fois l'événement commencé.
    ttlSeconds: 4 * HOUR,
    quietAtNight: true,
    coalesceSeconds: 0,
  },
  EVENT_UPDATED: {
    audience: 'PARTICIPANT',
    mandatory: true,
    urgent: true,
    // Une annulation ou un changement de salle ne doit pas s'évaporer en cinq secondes.
    sticky: true,
    phone: 'critical',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: false,
    coalesceSeconds: 0,
  },
  ORGANIZER_PUBLISHED: {
    audience: 'PARTICIPANT',
    mandatory: false,
    urgent: false,
    sticky: false,
    phone: 'optional',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: true,
    coalesceSeconds: 0,
  },
  RECOMMENDATION: {
    audience: 'PARTICIPANT',
    mandatory: false,
    urgent: false,
    sticky: false,
    phone: 'optional',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: true,
    coalesceSeconds: 0,
  },
  REFUND_COMPLETED: {
    audience: 'PARTICIPANT',
    mandatory: true,
    urgent: false,
    sticky: false,
    // L'opérateur de Mobile Money envoie déjà son propre message à la réception.
    phone: 'none',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: true,
    coalesceSeconds: 0,
  },
  SALE_RECEIVED: {
    audience: 'ORGANIZATION',
    mandatory: false,
    urgent: false,
    sticky: false,
    // Une vente = un message : par WhatsApp, cela ruinerait la plateforme.
    phone: 'none',
    email: false,
    // Une vente vieille de quelques heures n'apprend plus rien.
    ttlSeconds: 2 * HOUR,
    quietAtNight: true,
    coalesceSeconds: 90,
  },
  SOLD_OUT: {
    audience: 'ORGANIZATION',
    mandatory: false,
    urgent: false,
    sticky: false,
    phone: 'none',
    email: false,
    ttlSeconds: 6 * HOUR,
    quietAtNight: true,
    coalesceSeconds: 0,
  },
  EVENT_REVIEWED: {
    audience: 'ORGANIZATION',
    mandatory: true,
    urgent: true,
    sticky: false,
    // Comme avant : c'est ce que l'organisateur attend, et souvent le seul message qu'il lit.
    phone: 'critical',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: false,
    coalesceSeconds: 0,
  },
  VERIFICATION_REVIEWED: {
    audience: 'ORGANIZATION',
    mandatory: true,
    urgent: true,
    sticky: false,
    phone: 'critical',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: false,
    coalesceSeconds: 0,
  },
  PAYOUT_UPDATED: {
    audience: 'ORGANIZATION',
    mandatory: true,
    urgent: false,
    sticky: false,
    // L'opérateur de Mobile Money confirme déjà la réception de l'argent.
    phone: 'none',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: true,
    coalesceSeconds: 0,
  },
  /**
   * Une place payée : validée, refusée et remboursée, interrompue avec ses
   * jours rendus en avoir, ou terminée avec son bilan. De l'argent est en jeu
   * à chaque fois — elle ne se désactive pas —, mais rien n'y est urgent : ni
   * téléphone (le coût d'un WhatsApp n'y serait pas justifié), ni réveil la
   * nuit. L'e-mail garde la trace d'un service acheté.
   */
  SPOTLIGHT_UPDATED: {
    audience: 'ORGANIZATION',
    mandatory: true,
    urgent: false,
    sticky: false,
    phone: 'none',
    email: true,
    ttlSeconds: 24 * HOUR,
    quietAtNight: true,
    coalesceSeconds: 0,
  },
};

export function notificationPolicy(type: NotificationType): NotificationPolicy {
  return NOTIFICATION_POLICY[type];
}

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
 * Les types transactionnels portent une information que le destinataire DOIT
 * recevoir : son billet, une annulation, son remboursement, la décision sur son
 * événement, l'issue de son retrait. Les rendre optionnels reviendrait à laisser
 * quelqu'un se présenter devant une salle fermée — ou attendre un argent qui
 * est déjà parti. La liste se lit dans `NOTIFICATION_POLICY`, pas ici.
 */
export const MANDATORY_TYPES: readonly NotificationType[] = NOTIFICATION_TYPES.filter(
  (type) => NOTIFICATION_POLICY[type].mandatory,
);

export function isMandatory(type: NotificationType): boolean {
  return NOTIFICATION_POLICY[type].mandatory;
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
 *  · Ventes de mes événements : ACTIVES. Vendre des billets, c'est vouloir savoir
 *    qu'ils partent. L'interrupteur n'a d'effet que pour une organisation, et
 *    l'écran ne le montre qu'à qui en a une.
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
  salesAlerts: z.boolean().default(true),
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
    salesAlerts: z.boolean(),
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

// ─────────────────────────────────────────────────────────────────────────────
// Ce que l'appareil affiche
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le message que le serveur adresse au service worker.
 *
 * ── Le contrat entre deux programmes qui ne se voient jamais ────────────────
 * Le serveur l'écrit, le worker (`apps/web/public/sw.js`, du JavaScript brut,
 * hors de tout compilateur) le lit. Le worker ne connaît donc AUCUN type : il
 * applique ce qui est décrit ici — étiquette, urgence, silence, bouton — et
 * rien d'autre. Changer l'allure d'une notification se fait côté serveur, sans
 * attendre que chaque téléphone ait mis son worker à jour.
 *
 * `v` versionne le format : un worker plus ancien que le serveur ignore ce
 * qu'il ne comprend pas plutôt que d'afficher n'importe quoi.
 */
export const PUSH_PAYLOAD_VERSION = 1 as const;

/** Chemin de CE site : commence par « / », jamais par « // » (adresse d'un autre hôte). */
const internalPathSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^\/(?!\/)/, 'Un chemin interne commence par une barre oblique.');

export const pushPayloadSchema = z.object({
  v: z.literal(PUSH_PAYLOAD_VERSION),
  /** La notification du centre : le toucher la marque lue. `null` pour un message sans ligne au centre. */
  id: z.string().nullable(),
  type: notificationTypeSchema,
  title: z.string().min(1).max(120),
  body: z.string().max(300),
  /** Où mène le toucher. Toujours un chemin de ce site. */
  url: internalPathSchema,
  /** Libellé du bouton principal — le même que celui du centre. */
  actionLabel: z.string().min(1).max(40),
  /** Deux notifications de même étiquette se remplacent, et la seconde resonne. */
  tag: z.string().min(1).max(160),
  /** Non lues APRÈS celle-ci : la pastille de l'icône de l'application. */
  unread: z.number().int().min(0),
  /** Instant de l'événement en millisecondes, pour l'heure affichée même si le message arrive en retard. */
  ts: z.number().int(),
  /** Grande image sous le texte : la couverture de l'événement (absente sur iPhone). */
  image: z.string().url().max(500).optional(),
  urgent: z.boolean(),
  sticky: z.boolean(),
  silent: z.boolean(),
  /** Propose « Marquer comme lue » : ce qui ne presse pas se range sans ouvrir l'application. */
  canMarkRead: z.boolean(),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;

/** Porto-Novo est à UTC+1 toute l'année, sans heure d'été : le calcul n'a pas besoin de fuseau. */
const BENIN_UTC_OFFSET_HOURS = 1;

/** De 22 h à 7 h, heure de Porto-Novo, une notification qui n'urge pas n'a ni son ni vibration. */
export const QUIET_HOURS = { from: 22, to: 7 } as const;

export function isQuietHour(now: Date = new Date()): boolean {
  const hour = (now.getUTCHours() + BENIN_UTC_OFFSET_HOURS) % 24;
  return hour >= QUIET_HOURS.from || hour < QUIET_HOURS.to;
}

/** Ce qu'il faut savoir d'une notification du centre pour la pousser sur l'appareil. */
export interface PushSource {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly actionUrl: string;
  readonly actionLabel: string;
  readonly eventId: string | null;
  readonly orderId: string | null;
  readonly createdAt: Date;
}

/**
 * L'étiquette d'une notification sur l'appareil.
 *
 * Elle dit « c'est la même histoire » : une commande, un événement. Le rappel
 * de la veille remplace celui de la semaine, le changement de salle remplace le
 * changement d'horaire — la dernière nouvelle est la seule qui compte à
 * l'écran, et le centre garde l'historique. Jamais l'identifiant de la
 * notification seul : chacune serait alors une île, et rien ne s'empilerait
 * jamais proprement.
 */
export function pushTag(source: Pick<PushSource, 'id' | 'type' | 'eventId' | 'orderId'>): string {
  switch (source.type) {
    // Une seule à la fois, quelle qu'en soit la matière.
    case 'RECOMMENDATION':
    case 'VERIFICATION_REVIEWED':
      return source.type;
    default:
      return `${source.type}:${source.orderId ?? source.eventId ?? source.id}`;
  }
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Compose le message de l'appareil.
 *
 * Pure : l'heure et l'image arrivent de l'appelant, ce qui la rend vérifiable
 * sans serveur. Le texte est abrégé ici et non chez le service de notification :
 * celui-ci refuse tout message chiffré de plus de 4 Ko, et un titre de
 * modération collé en entier pourrait suffire à le dépasser.
 */
export function buildPushPayload(
  source: PushSource,
  context: { unread: number; image?: string | null; now?: Date },
): PushPayload {
  const policy = NOTIFICATION_POLICY[source.type];

  return {
    v: PUSH_PAYLOAD_VERSION,
    id: source.id,
    type: source.type,
    title: clip(source.title, 100),
    body: clip(source.body, 240),
    url: source.actionUrl,
    actionLabel: clip(source.actionLabel, 32),
    tag: pushTag(source),
    unread: Math.max(0, Math.trunc(context.unread)),
    ts: source.createdAt.getTime(),
    ...(context.image ? { image: context.image } : {}),
    urgent: policy.urgent,
    sticky: policy.sticky,
    silent: policy.quietAtNight && isQuietHour(context.now),
    canMarkRead: !policy.urgent,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Remboursement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Message d'un remboursement effectué.
 *
 * L'annulation dit « tu seras remboursé » ; ce message dit « c'est fait ». Sans
 * lui, la promesse reste ouverte des jours, et l'unique façon de la refermer est
 * d'écrire au support.
 *
 * `amountLabel` et `phoneLabel` arrivent déjà formatés : ce paquet ne connaît ni
 * les devises ni les indicatifs.
 */
export function buildRefundMessage(input: {
  eventTitle: string;
  amountLabel: string;
  phoneLabel: string | null;
}): { title: string; body: string } {
  return {
    title: 'Remboursement effectué',
    body: input.phoneLabel
      ? `${input.amountLabel} ont été renvoyés sur ${input.phoneLabel} pour « ${input.eventTitle} ».`
      : `${input.amountLabel} te sont renvoyés pour « ${input.eventTitle} ».`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui arrive à une organisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lien d'une notification d'organisation.
 *
 * ── Pourquoi un détour par `/pro/ouvrir` ────────────────────────────────────
 * L'organisation active d'une personne est mémorisée dans un cookie. Quelqu'un
 * qui en gère deux et touche la notification de la seconde tomberait sur une
 * page introuvable — l'événement n'appartient pas à l'organisation du cookie.
 * `/pro/ouvrir` vérifie l'appartenance, bascule l'organisation, puis redirige
 * vers `path`. Le chemin reste un chemin de l'espace organisateur : c'est ce que
 * la route impose, et la contrainte de la base (`actionUrl` relatif) le permet.
 */
export function organizationLink(organizationId: string, path: string): string {
  return `/pro/ouvrir?org=${encodeURIComponent(organizationId)}&suite=${encodeURIComponent(path)}`;
}

/**
 * Message d'une vente — ou de plusieurs, regroupées.
 *
 * ── Pourquoi regrouper ──────────────────────────────────────────────────────
 * Le jour où une billetterie s'ouvre, les ventes arrivent par dizaines en
 * quelques minutes. Une notification par vente noierait le téléphone et
 * apprendrait à tout couper ; « 12 nouvelles ventes · 60 000 F CFA » dit la même
 * chose en une ligne qu'on lit.
 *
 * Aucun nom d'acheteur : l'écran de verrouillage est lu par ceux qui regardent
 * par-dessus l'épaule, et le nom s'affiche dans l'espace organisateur.
 */
export function buildSaleMessage(input: {
  eventTitle: string;
  orders: number;
  tickets: number;
  /** `null` : événement gratuit — on parle d'inscriptions, pas de ventes. */
  amountLabel: string | null;
  /** Renseigné quand la seule catégorie vendue est unique : « 2 × Pass VIP ». */
  ticketTypeName: string | null;
  /** Places restantes après cette vente, si on sait les compter. */
  remaining: number | null;
}): { title: string; body: string } {
  const free = input.amountLabel === null;
  const noun = free ? 'inscription' : 'vente';
  const single = input.orders === 1;

  const title = single
    ? `Nouvelle ${noun} · ${input.eventTitle}`
    : `${input.orders} nouvelles ${noun}s · ${input.eventTitle}`;

  const what =
    single && input.ticketTypeName
      ? `${input.tickets} × ${input.ticketTypeName}`
      : `${input.tickets} billet${input.tickets > 1 ? 's' : ''}`;

  const parts = [what];
  if (input.amountLabel) parts.push(input.amountLabel);
  if (input.remaining !== null && input.remaining > 0) {
    parts.push(`il en reste ${input.remaining}`);
  }

  return { title, body: parts.join(' · ') };
}

/**
 * Message d'épuisement : toute une catégorie (`ticketTypeName`), ou tout
 * l'événement (`null`).
 */
export function buildSoldOutMessage(input: { eventTitle: string; ticketTypeName: string | null }): {
  title: string;
  body: string;
} {
  if (input.ticketTypeName) {
    return {
      title: `« ${input.ticketTypeName} » est épuisé`,
      body: `${input.eventTitle} : plus aucune place dans cette catégorie. Tu peux en ouvrir une autre ou ajuster le stock depuis ton espace.`,
    };
  }

  return {
    title: `${input.eventTitle} est complet`,
    body: 'Toutes les places sont vendues.',
  };
}

/** Message de la décision de modération sur un événement soumis. */
export function buildEventReviewMessage(input: {
  eventTitle: string;
  approved: boolean;
  note?: string | null;
}): { title: string; body: string } {
  if (input.approved) {
    return {
      title: `« ${input.eventTitle} » est en ligne`,
      body: 'Partage ton lien : les ventes sont ouvertes.',
    };
  }

  return {
    title: `« ${input.eventTitle} » n’a pas été publié`,
    body: [input.note?.trim(), 'Corrige et resoumets depuis ton espace.']
      .filter((line): line is string => Boolean(line))
      .join(' '),
  };
}

/** Issue d'un retrait : versé, échoué, ou annulé. */
export type PayoutOutcome = 'PAID' | 'FAILED' | 'CANCELLED';

/**
 * Message de l'issue d'un retrait.
 *
 * Un retrait échoué dit POURQUOI et ce qu'il advient de l'argent : sans cela,
 * l'organisateur réessaie avec le même numéro, et échoue de la même façon.
 */
export function buildPayoutMessage(input: {
  outcome: PayoutOutcome;
  amountLabel: string;
  accountLabel: string;
  reference: string;
  failureReason?: string | null;
}): { title: string; body: string } {
  switch (input.outcome) {
    case 'PAID':
      return {
        title: 'Retrait versé',
        body: `${input.amountLabel} envoyés sur ${input.accountLabel} (réf. ${input.reference}).`,
      };
    case 'FAILED':
      return {
        title: 'Retrait échoué',
        body: `${input.failureReason?.trim() || 'L’opérateur a refusé le versement.'} Le montant est de nouveau disponible : vérifie ton compte de réception (${input.accountLabel}) avant de réessayer.`,
      };
    case 'CANCELLED':
      return {
        title: 'Retrait annulé',
        body: `Le retrait ${input.reference} de ${input.amountLabel} a été annulé. Le montant est de nouveau disponible.`,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mise en avant
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qui arrive à une place à la une payée — chaque issue est un message. */
export type SpotlightBookingOutcome =
  | 'APPROVED'
  | 'REJECTED'
  | 'INTERRUPTED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'UNFULFILLABLE'
  | 'CREDITED';

/**
 * Message d'une place à la une.
 *
 * Chacun dit ce qu'il advient de l'ARGENT, quand il y en a : rendu au solde
 * (refus), rendu en avoir (jours non diffusés), ou dépensé — avec le bilan qui
 * dit à quoi. Une place payée dont on n'entend plus parler est la plus sûre
 * façon de ne jamais en vendre une seconde.
 *
 * Les montants et la période arrivent déjà formatés.
 */
export function buildSpotlightBookingMessage(input: {
  outcome: SpotlightBookingOutcome;
  eventTitle: string;
  periodLabel: string;
  amountLabel?: string | null;
  /** Refus : l'avoir qui avait réglé la place, rendu tel quel. */
  restoredCreditLabel?: string | null;
  reason?: string | null;
  report?: { views: number; clicks: number; tickets: number } | null;
}): { title: string; body: string } {
  const event = `« ${input.eventTitle} »`;
  const reason = input.reason?.trim().replace(/\.$/, '');

  switch (input.outcome) {
    case 'APPROVED':
      return {
        title: 'Mise en avant validée',
        body: [
          sentence(`${event} sera à la une ${input.periodLabel}`),
          reason ? sentence(reason) : null,
          'Tu suivras ses vues, ses clics et ses ventes depuis ton espace.',
        ]
          .filter(Boolean)
          .join(' '),
      };
    case 'REJECTED':
      return {
        title: 'Mise en avant refusée',
        body: [
          reason ? sentence(reason) : null,
          input.amountLabel
            ? `${input.amountLabel} ont été recrédités sur ton solde Nexa Kabi.`
            : null,
          input.restoredCreditLabel
            ? `Ton avoir de ${input.restoredCreditLabel} t’est rendu.`
            : null,
          !input.amountLabel && !input.restoredCreditLabel ? 'Rien ne t’a été prélevé.' : null,
        ]
          .filter(Boolean)
          .join(' '),
      };
    case 'INTERRUPTED':
      return {
        title: 'Mise en avant interrompue',
        body: [
          `${event} a quitté la une${reason ? ` : ${reason}` : ''}.`,
          input.amountLabel
            ? `Les jours non diffusés te sont rendus en avoir : ${input.amountLabel}, valable 12 mois.`
            : null,
        ]
          .filter(Boolean)
          .join(' '),
      };
    case 'CANCELLED':
      return {
        title: 'Mise en avant annulée',
        body: input.amountLabel
          ? `Les jours non diffusés de ${event} te sont rendus en avoir : ${input.amountLabel}, valable 12 mois.`
          : `La mise en avant de ${event} est annulée.`,
      };
    case 'COMPLETED': {
      const report = input.report;
      return {
        title: 'Bilan de ta mise en avant',
        body: report
          ? `${event} ${input.periodLabel} : ${count(report.views, 'vue', 'vues')}, ${count(report.clicks, 'clic', 'clics')}, ${count(report.tickets, 'billet vendu', 'billets vendus')} grâce à la une.`
          : `La mise en avant de ${event} est terminée.`,
      };
    }
    case 'UNFULFILLABLE':
      return {
        title: 'Place à la une indisponible',
        body: `Ton paiement est arrivé après la fin de la réservation, et la place a été prise. ${
          input.amountLabel
            ? `${input.amountLabel} ont été recrédités sur ton solde Nexa Kabi.`
            : ''
        }`.trim(),
      };
    case 'CREDITED':
      return {
        title: 'Avoir de mise en avant',
        body: `${input.amountLabel ?? 'Un avoir'} te ${input.amountLabel ? 'sont rendus' : 'est accordé'} pour ${event}${
          reason ? ` : ${reason}` : ''
        }. Valable 12 mois sur ta prochaine mise en avant.`,
      };
  }
}

/** Une phrase terminée par un point — sans le doubler après « nov. ». */
function sentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** « 0 vue », « 1 clic », « 12 billets vendus » : le singulier jusqu'à un, en français. */
function count(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString('fr-FR')} ${value > 1 ? plural : singular}`;
}
