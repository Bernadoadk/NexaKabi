/**
 * À la une — les mises en avant de Découvrir et de l'accueil.
 *
 * ── Deux sortes de diapositives ─────────────────────────────────────────────
 *  · `EVENT`    : un événement de la plateforme. La une mène à sa page, avec
 *                 `?ref=une-<id>` : un billet acheté ensuite lui est attribué.
 *  · `EXTERNAL` : un événement dont la billetterie n'est pas chez nous. La une
 *                 l'annonce comme tel (« Billetterie externe ») et mène au site
 *                 officiel, dans un nouvel onglet, par une redirection qui
 *                 compte le clic — l'argument qui fera venir ce partenaire.
 *
 * ── Deux origines ───────────────────────────────────────────────────────────
 *  · le choix de l'équipe, composé dans la console ;
 *  · une place ACHETÉE par l'organisateur (`SpotlightBooking`) : à la journée,
 *    dans un nombre de places limité par jour et par pays, validée par
 *    l'équipe avant diffusion. Une place achetée devient une mise en avant
 *    ordinaire (`source: 'PAID'`) au moment de sa validation.
 *
 * ── Ce que la une ne montre jamais ──────────────────────────────────────────
 * Un événement annulé, complet, dépublié ou passé : il quitte la une à la
 * lecture suivante, sans que personne ait à le retirer.
 */

import { z } from 'zod';
import { idSchema, isoDateSchema } from './common.js';
import { paymentMethodCodeSchema } from './enums.js';

// ─────────────────────────────────────────────────────────────────────────────
// Énumérations
// ─────────────────────────────────────────────────────────────────────────────

export const SPOTLIGHT_KINDS = ['EVENT', 'EXTERNAL'] as const;
export const spotlightKindSchema = z.enum(SPOTLIGHT_KINDS);
export type SpotlightKind = z.infer<typeof spotlightKindSchema>;

export const SPOTLIGHT_SOURCES = ['EDITORIAL', 'PAID'] as const;
export const spotlightSourceSchema = z.enum(SPOTLIGHT_SOURCES);
export type SpotlightSource = z.infer<typeof spotlightSourceSchema>;

export const SPOTLIGHT_SOURCE_LABELS: Readonly<Record<SpotlightSource, string>> = {
  EDITORIAL: 'Choix de l’équipe',
  PAID: 'Place payée',
};

/**
 * Où en est une mise en avant, à l'instant de la lecture.
 *
 * Calculé, jamais stocké : seul le retrait manuel est écrit en base. « En
 * ligne » et « terminée » se lisent sur les dates.
 */
export const SPOTLIGHT_PHASES = ['LIVE', 'SCHEDULED', 'ENDED', 'WITHDRAWN'] as const;
export const spotlightPhaseSchema = z.enum(SPOTLIGHT_PHASES);
export type SpotlightPhase = z.infer<typeof spotlightPhaseSchema>;

export const SPOTLIGHT_PHASE_LABELS: Readonly<Record<SpotlightPhase, string>> = {
  LIVE: 'En ligne',
  SCHEDULED: 'Programmée',
  ENDED: 'Terminée',
  WITHDRAWN: 'Retirée',
};

/** Préfixe du `?ref=` porté par les liens de la une, et retrouvé sur la commande. */
export const SPOTLIGHT_REF_PREFIX = 'une-';

export function spotlightRef(spotlightId: string): string {
  return `${SPOTLIGHT_REF_PREFIX}${spotlightId}`;
}

/** Une vue n'est comptée que si la diapositive est restée affichée aussi longtemps. */
export const SPOTLIGHT_VIEW_MIN_MS = 1_000;

/** Nombre de mises en avant qu'un envoi groupé de vues peut porter. */
export const SPOTLIGHT_VIEWS_BATCH_MAX = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Jours de la une
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une place se vend À LA JOURNÉE, et la journée est celle de Porto-Novo.
 *
 * ── Pourquoi un fuseau fixe, et pas celui de chaque pays ────────────────────
 * Les pays ouverts (UTC+0 et UTC+1) n'ont pas d'heure d'été : un décalage fixe
 * suffit, et il donne le même calendrier au serveur (UTC sur Vercel), à la
 * console et au téléphone de l'organisateur. La journée vendue court de minuit
 * à minuit, heure de Porto-Novo — c'est ce que disent les écrans.
 */
export const SPOTLIGHT_DAY_OFFSET = '+01:00';
const DAY_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-JJ`, une vraie date du calendrier. */
export const spotlightDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Date invalide');

export type SpotlightDay = z.infer<typeof spotlightDaySchema>;

/** Minuit (Porto-Novo) au début de `day`. */
export function spotlightDayStart(day: string): Date {
  return new Date(`${day}T00:00:00${SPOTLIGHT_DAY_OFFSET}`);
}

/** Minuit (Porto-Novo) à la fin de `day` — le début du lendemain. */
export function spotlightDayEnd(day: string): Date {
  return new Date(spotlightDayStart(day).getTime() + DAY_MS);
}

/** Le jour (Porto-Novo) d'un instant. */
export function spotlightDayOf(instant: Date): string {
  return new Date(instant.getTime() + DAY_OFFSET_MS).toISOString().slice(0, 10);
}

export function addSpotlightDays(day: string, count: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + count * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Nombre de jours de `start` à `end`, bornes comprises. */
export function countSpotlightDays(start: string, end: string): number {
  return (
    Math.round(
      (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / DAY_MS,
    ) + 1
  );
}

/** Les jours de `start` à `end`, bornes comprises. */
export function listSpotlightDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addSpotlightDays(day, 1)) days.push(day);
  return days;
}

/**
 * Jours d'une place pas encore commencés à l'instant `at`.
 *
 * C'est la règle de l'avoir : un jour ENTAMÉ est dû — la place a été montrée,
 * fût-ce une heure —, un jour qui n'a pas commencé ne l'est pas.
 */
export function unstartedSpotlightDays(
  booking: { startDay: string; endDay: string },
  at: Date,
): number {
  let count = 0;
  for (const day of listSpotlightDays(booking.startDay, booking.endDay)) {
    if (spotlightDayStart(day).getTime() > at.getTime()) count += 1;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Réglages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Réglages de la une, modifiables dans la console.
 *
 * Six diapositives au plus : au-delà, personne ne voit les dernières, et une
 * place qu'on ne voit pas ne vaut rien — ni pour le visiteur, ni pour celui
 * qui l'a payée. Sur ces six, quatre se vendent par jour et par pays ; les
 * autres restent à l'équipe (coups de cœur, partenaires externes).
 *
 * La cohérence entre champs (places vendables ≤ places à la une) est vérifiée
 * par le service : un schéma raffiné ne se prête plus à `.partial()`.
 */
export const spotlightSettingsSchema = z.object({
  maxSlides: z.number().int().min(1).max(8),
  /** Durée d'affichage d'une diapositive avant la suivante, en secondes. */
  slideSeconds: z.number().int().min(4).max(15),
  /** Mention « Sponsorisé » sur les places payées. */
  showSponsoredLabel: z.boolean(),
  /** La vente de places aux organisateurs est ouverte. */
  salesEnabled: z.boolean(),
  /** Places vendables par jour et par pays. */
  paidSlotsPerDay: z.number().int().min(0).max(8),
  /**
   * Prix d'un jour, par pays, dans la devise du pays. Un pays absent n'est
   * pas ouvert à la vente.
   */
  pricePerDay: z.record(
    z.string().regex(/^[A-Z]{2}$/),
    z.number().int().min(100, '100 au minimum').max(1_000_000),
  ),
  /**
   * Premier jour réservable, en jours à partir d'aujourd'hui. 2 = après-demain :
   * l'équipe a toujours 24 heures pour valider avant la diffusion.
   */
  minLeadDays: z.number().int().min(1).max(14),
  /** Jusqu'où l'on peut réserver, en jours. */
  horizonDays: z.number().int().min(7).max(180),
  /** Jours d'une même réservation, au plus. */
  maxDaysPerBooking: z.number().int().min(1).max(60),
});

export type SpotlightSettings = z.infer<typeof spotlightSettingsSchema>;

export const DEFAULT_SPOTLIGHT_SETTINGS: SpotlightSettings = {
  maxSlides: 6,
  slideSeconds: 7,
  showSponsoredLabel: true,
  salesEnabled: true,
  paidSlotsPerDay: 4,
  pricePerDay: { BJ: 500 },
  minLeadDays: 2,
  horizonDays: 60,
  maxDaysPerBooking: 14,
};

/** Correctif des réglages. Aucun défaut : un champ absent ne doit rien écraser. */
export const updateSpotlightSettingsSchema = spotlightSettingsSchema.partial();
export type UpdateSpotlightSettingsInput = z.infer<typeof updateSpotlightSettingsSchema>;

/** Validité d'un avoir de mise en avant, en mois. */
export const SPOTLIGHT_CREDIT_VALIDITY_MONTHS = 12;

/** Le temps de payer une place réservée par Mobile Money ou carte, en minutes. */
export const SPOTLIGHT_PAYMENT_HOLD_MINUTES = 30;

/** Délai de validation promis à l'organisateur, en heures. */
export const SPOTLIGHT_REVIEW_HOURS = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Vidéo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vidéo d'une diapositive.
 *
 * Déposée directement chez le stockage, qui la recadre, la compresse, la coupe
 * à quinze secondes et la prive de son : la une la lit muette, et sur une
 * bonne connexion seulement. L'image reste l'affiche tant que la vidéo n'est
 * pas prête — et partout où elle ne sera jamais lue.
 */
export const SPOTLIGHT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const SPOTLIGHT_VIDEO_MAX_LABEL = '50 Mo';
/** Durée diffusée, au plus : au-delà, la vidéo est coupée. */
export const SPOTLIGHT_VIDEO_MAX_SECONDS = 15;
/** Durée acceptée au dépôt — plus longue, elle est refusée plutôt que coupée au hasard. */
export const SPOTLIGHT_VIDEO_SOURCE_MAX_SECONDS = 60;
export const SPOTLIGHT_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

const httpsUrl = (message: string) =>
  z
    .string()
    .trim()
    .max(600)
    .url(message)
    .refine(
      (value) => value.startsWith('https://') || value.startsWith('http://localhost'),
      message,
    );

export const spotlightVideoSchema = z.object({
  url: httpsUrl('Vidéo invalide'),
  posterUrl: httpsUrl('Affiche de la vidéo invalide'),
  durationSeconds: z.number().int().min(1).max(SPOTLIGHT_VIDEO_MAX_SECONDS),
});

export type SpotlightVideo = z.infer<typeof spotlightVideoSchema>;

/** Ticket de dépôt direct d'une vidéo — toujours direct : une vidéo ne transite pas par nos serveurs. */
export interface SpotlightVideoTicket {
  readonly uploadUrl: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly fileField: string;
  readonly maxBytes: number;
  readonly expiresAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture publique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une diapositive, sous la même forme quelle que soit sa sorte : le composant
 * public n'a pas à savoir d'où vient l'événement, seulement où il mène.
 */
export const spotlightSlideSchema = z.object({
  id: idSchema,
  kind: spotlightKindSchema,
  /** Vrai quand la mention « Sponsorisé » doit s'afficher. */
  sponsored: z.boolean(),
  title: z.string(),
  categoryName: z.string().nullable(),
  /** Slug de la catégorie, pour l'icône ; absent pour un événement externe. */
  categorySlug: z.string().nullable(),
  /** Teinte de repli quand le visuel manque ou échoue. */
  color: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  venueName: z.string().nullable(),
  cityName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** Vidéo muette, lue sur une bonne connexion seulement. */
  video: spotlightVideoSchema.nullable(),
  /** `EVENT` : page de l'événement. */
  slug: z.string().nullable(),
  /** `EVENT` : prix d'appel — `0` si gratuit, `null` si aucun billet en vente. */
  fromPrice: z.number().int().nullable(),
  currency: z.string(),
  /** `EXTERNAL` : qui vend les billets, et le prix tel que l'équipe l'a saisi. */
  organizerName: z.string().nullable(),
  priceLabel: z.string().nullable(),
  /** `EXTERNAL` : le domaine de la billetterie, affiché pour qu'on sache où l'on va. */
  externalHost: z.string().nullable(),
});

export type SpotlightSlide = z.infer<typeof spotlightSlideSchema>;

export const spotlightFeedSchema = z.object({
  slideSeconds: z.number().int(),
  slides: z.array(spotlightSlideSchema),
});

export type SpotlightFeed = z.infer<typeof spotlightFeedSchema>;

export const EMPTY_SPOTLIGHT_FEED: SpotlightFeed = {
  slideSeconds: DEFAULT_SPOTLIGHT_SETTINGS.slideSeconds,
  slides: [],
};

/** Vues accumulées par une page, envoyées par lot. */
export const recordSpotlightViewsSchema = z.object({
  ids: z.array(idSchema).min(1).max(SPOTLIGHT_VIEWS_BATCH_MAX),
});

export type RecordSpotlightViewsInput = z.infer<typeof recordSpotlightViewsSchema>;

/** Où mène un clic : une URL absolue (externe) ou un chemin du site. */
export const spotlightClickTargetSchema = z.object({ url: z.string() });
export type SpotlightClickTarget = z.infer<typeof spotlightClickTargetSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Console — mises en avant
// ─────────────────────────────────────────────────────────────────────────────

/** Lien de billetterie : https seulement, jamais un `javascript:` ni un `http:` en clair. */
const externalUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url('Lien invalide')
  .refine((value) => value.startsWith('https://'), 'Le lien doit commencer par https://');

/** Visuel déposé par la console — toujours une adresse https servie par le stockage. */
const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url('Visuel invalide')
  .refine((value) => value.startsWith('https://') || value.startsWith('http://localhost'), {
    message: 'Visuel invalide',
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const spotlightExternalInputSchema = z.object({
  title: z.string().trim().min(3, 'Titre trop court').max(80, '80 caractères au plus'),
  startsAt: isoDateSchema,
  endsAt: isoDateSchema.nullable().optional(),
  venueName: optionalText(120),
  cityName: optionalText(80),
  organizerName: z.string().trim().min(2, 'Indique qui vend les billets').max(120),
  url: externalUrlSchema,
  priceLabel: optionalText(60),
  categoryLabel: optionalText(40),
});

export type SpotlightExternalInput = z.infer<typeof spotlightExternalInputSchema>;

const spotlightCommonInput = {
  source: spotlightSourceSchema,
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Pays invalide'),
  startsAt: isoDateSchema,
  endsAt: isoDateSchema,
  imageUrl: imageUrlSchema.nullable().optional(),
  video: spotlightVideoSchema.nullable().optional(),
};

export const createSpotlightSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('EVENT'), eventId: idSchema, ...spotlightCommonInput }),
  z.object({
    kind: z.literal('EXTERNAL'),
    external: spotlightExternalInputSchema,
    ...spotlightCommonInput,
    imageUrl: imageUrlSchema,
  }),
]);

export type CreateSpotlightInput = z.infer<typeof createSpotlightSchema>;

/**
 * Modification. La sorte ne change pas : une mise en avant d'événement qui
 * deviendrait externe garderait un bilan qui ne parle plus de la même chose.
 */
export const updateSpotlightSchema = z.object({
  eventId: idSchema.optional(),
  external: spotlightExternalInputSchema.optional(),
  source: spotlightSourceSchema.optional(),
  countryCode: spotlightCommonInput.countryCode.optional(),
  startsAt: isoDateSchema.optional(),
  endsAt: isoDateSchema.optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
  video: spotlightVideoSchema.nullable().optional(),
});

export type UpdateSpotlightInput = z.infer<typeof updateSpotlightSchema>;

/** Nouvel ordre de la une : les identifiants, du premier au dernier. */
export const reorderSpotlightsSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
});

export type ReorderSpotlightsInput = z.infer<typeof reorderSpotlightsSchema>;

/**
 * Retrait d'une mise en avant. Pour une place payée, les jours qui n'ont pas
 * commencé sont rendus en avoir — sauf décision contraire, motivée : un
 * contenu trompeur ne se rembourse pas.
 */
export const withdrawSpotlightSchema = z
  .object({
    compensate: z.boolean().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((input) => input.compensate !== false || (input.reason?.length ?? 0) >= 10, {
    message: 'Explique pourquoi les jours restants ne sont pas rendus.',
    path: ['reason'],
  });

export type WithdrawSpotlightInput = z.infer<typeof withdrawSpotlightSchema>;

export const spotlightStatsSchema = z.object({
  views: z.number().int(),
  clicks: z.number().int(),
  /** Billets émis par des commandes venues de la une ; `null` pour un événement externe. */
  tickets: z.number().int().nullable(),
});

export type SpotlightStats = z.infer<typeof spotlightStatsSchema>;

export const spotlightAdminSchema = z.object({
  id: idSchema,
  kind: spotlightKindSchema,
  source: spotlightSourceSchema,
  phase: spotlightPhaseSchema,
  /**
   * Pourquoi une mise en avant « en ligne » n'apparaît pourtant pas : événement
   * annulé, complet, dépublié, passé. `null` quand rien ne l'empêche.
   */
  hiddenReason: z.string().nullable(),
  position: z.number().int(),
  countryCode: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  withdrawnAt: z.string().nullable(),
  /** Le titre et le visuel tels que la une les affiche. */
  title: z.string(),
  displayImageUrl: z.string().nullable(),
  /** Visuel propre à la une, s'il remplace la couverture de l'événement. */
  imageUrl: z.string().nullable(),
  video: spotlightVideoSchema.nullable(),
  /** Réservation d'origine, pour une place achetée par un organisateur. */
  bookingId: idSchema.nullable(),
  bookingReference: z.string().nullable(),
  event: z
    .object({
      id: idSchema,
      slug: z.string(),
      title: z.string(),
      startsAt: z.string(),
      status: z.string(),
      organizationName: z.string(),
      coverImageUrl: z.string().nullable(),
      cityName: z.string().nullable(),
    })
    .nullable(),
  external: z
    .object({
      title: z.string(),
      startsAt: z.string(),
      endsAt: z.string().nullable(),
      venueName: z.string().nullable(),
      cityName: z.string().nullable(),
      organizerName: z.string(),
      url: z.string(),
      priceLabel: z.string().nullable(),
      categoryLabel: z.string().nullable(),
    })
    .nullable(),
  stats: spotlightStatsSchema,
  createdByName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SpotlightAdmin = z.infer<typeof spotlightAdminSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Places achetées par les organisateurs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La vie d'une place achetée.
 *
 *   AWAITING_PAYMENT ─► PENDING_REVIEW ─► APPROVED ─► COMPLETED
 *          │                 │               │
 *          ▼                 ▼               ▼
 *       EXPIRED          REJECTED       INTERRUPTED / CANCELLED
 *    (rien prélevé)   (argent rendu)   (jours restants en avoir)
 *
 * Seul le REFUS de l'équipe rend de l'argent. Tout le reste — l'organisateur
 * qui annule, l'événement annulé ou complet en cours de diffusion, un retrait
 * par l'équipe — rend les jours non commencés en avoir de mise en avant,
 * valable douze mois. Un jour entamé est dû.
 */
export const SPOTLIGHT_BOOKING_STATUSES = [
  'AWAITING_PAYMENT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'INTERRUPTED',
  'EXPIRED',
  'COMPLETED',
] as const;

export const spotlightBookingStatusSchema = z.enum(SPOTLIGHT_BOOKING_STATUSES);
export type SpotlightBookingStatus = z.infer<typeof spotlightBookingStatusSchema>;

export const SPOTLIGHT_BOOKING_STATUS_LABELS: Readonly<Record<SpotlightBookingStatus, string>> = {
  AWAITING_PAYMENT: 'En attente de paiement',
  PENDING_REVIEW: 'En validation',
  APPROVED: 'Validée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
  INTERRUPTED: 'Interrompue',
  EXPIRED: 'Non payée',
  COMPLETED: 'Terminée',
};

/** Places qui occupent le calendrier. */
export const SPOTLIGHT_BOOKING_HOLDING_STATUSES: readonly SpotlightBookingStatus[] = [
  'AWAITING_PAYMENT',
  'PENDING_REVIEW',
  'APPROVED',
];

/**
 * Comment la place a été réglée.
 *  · `PROVIDER` : Mobile Money ou carte, dans la fenêtre du prestataire ;
 *  · `BALANCE`  : prélevée sur le solde de l'organisation ;
 *  · `CREDIT`   : entièrement couverte par un avoir.
 * Un avoir partiel s'ajoute aux deux premiers (`creditAmount`).
 */
export const SPOTLIGHT_PAYMENT_METHODS = ['PROVIDER', 'BALANCE', 'CREDIT'] as const;
export const spotlightPaymentMethodSchema = z.enum(SPOTLIGHT_PAYMENT_METHODS);
export type SpotlightPaymentMethod = z.infer<typeof spotlightPaymentMethodSchema>;

export const SPOTLIGHT_PAYMENT_METHOD_LABELS: Readonly<Record<SpotlightPaymentMethod, string>> = {
  PROVIDER: 'Mobile Money ou carte',
  BALANCE: 'Solde Nexa Kabi',
  CREDIT: 'Avoir de mise en avant',
};

export const SPOTLIGHT_CREDIT_REASONS = [
  /** L'organisateur a annulé. */
  'CANCELLATION',
  /** Son événement a été annulé, dépublié, supprimé ou est complet. */
  'INTERRUPTION',
  /** L'équipe a retiré la place en cours de diffusion. */
  'WITHDRAWAL',
  /** La validation est arrivée après le début de la diffusion. */
  'LATE_REVIEW',
  /** Geste de l'équipe : une panne de la une, un incident. */
  'GESTURE',
] as const;

export const spotlightCreditReasonSchema = z.enum(SPOTLIGHT_CREDIT_REASONS);
export type SpotlightCreditReason = z.infer<typeof spotlightCreditReasonSchema>;

export const SPOTLIGHT_CREDIT_REASON_LABELS: Readonly<Record<SpotlightCreditReason, string>> = {
  CANCELLATION: 'Annulation de ta part',
  INTERRUPTION: 'Événement indisponible pendant la diffusion',
  WITHDRAWAL: 'Retrait par l’équipe',
  LATE_REVIEW: 'Validation tardive',
  GESTURE: 'Geste de l’équipe',
};

/** Phase d'une place validée — `null` tant qu'elle n'est pas validée. */
export const SPOTLIGHT_BOOKING_PHASES = ['SCHEDULED', 'LIVE', 'ENDED'] as const;
export type SpotlightBookingPhase = (typeof SPOTLIGHT_BOOKING_PHASES)[number];

export function computeSpotlightBookingPhase(
  booking: { status: SpotlightBookingStatus; startsAt: Date; endsAt: Date },
  now: Date,
): SpotlightBookingPhase | null {
  if (booking.status !== 'APPROVED' && booking.status !== 'COMPLETED') return null;
  if (booking.endsAt <= now || booking.status === 'COMPLETED') return 'ENDED';
  if (booking.startsAt > now) return 'SCHEDULED';
  return 'LIVE';
}

/** Demande de place : des jours, un moyen de payer, un visuel ou une vidéo facultatifs. */
export const createSpotlightBookingSchema = z
  .object({
    startDay: spotlightDaySchema,
    endDay: spotlightDaySchema,
    /** `CREDIT` se décide côté serveur, quand l'avoir couvre tout. */
    paymentMethod: z.enum(['PROVIDER', 'BALANCE']),
    /** Visuel propre à la une ; absent : la couverture de l'événement. */
    imageUrl: imageUrlSchema.nullable().optional(),
    video: spotlightVideoSchema.nullable().optional(),
  })
  .refine((input) => input.endDay >= input.startDay, {
    message: 'Le dernier jour doit venir après le premier.',
    path: ['endDay'],
  });

export type CreateSpotlightBookingInput = z.infer<typeof createSpotlightBookingSchema>;

export const rejectSpotlightBookingSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Explique le refus : l’organisateur ne verra que ce message.')
    .max(500),
});

export type RejectSpotlightBookingInput = z.infer<typeof rejectSpotlightBookingSchema>;

/** Geste de l'équipe : rendre des jours en avoir (une panne de la une, par exemple). */
export const creditSpotlightBookingSchema = z.object({
  days: z.number().int().min(1).max(60),
  reason: z.string().trim().min(10, 'Explique le geste : il sera lu par l’organisateur.').max(500),
});

export type CreditSpotlightBookingInput = z.infer<typeof creditSpotlightBookingSchema>;

/** Ouverture de la fenêtre de paiement d'une place : le moyen choisi (Mobile Money, carte). */
export const paySpotlightBookingSchema = z.object({
  method: paymentMethodCodeSchema,
});

export type PaySpotlightBookingInput = z.infer<typeof paySpotlightBookingSchema>;

/** Confirmation d'un paiement fait dans la fenêtre du prestataire — une piste, pas une preuve. */
export const confirmSpotlightPaymentSchema = z.object({
  providerReference: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, 'Référence de transaction invalide'),
});

export type ConfirmSpotlightPaymentInput = z.infer<typeof confirmSpotlightPaymentSchema>;

export const spotlightBookingSchema = z.object({
  id: idSchema,
  /** `NKU-8F4C21` — la référence du reçu. */
  reference: z.string(),
  status: spotlightBookingStatusSchema,
  phase: z.enum(SPOTLIGHT_BOOKING_PHASES).nullable(),
  eventId: idSchema,
  eventTitle: z.string(),
  countryCode: z.string(),
  startDay: z.string(),
  endDay: z.string(),
  days: z.number().int(),
  startsAt: z.string(),
  endsAt: z.string(),
  pricePerDay: z.number().int(),
  totalAmount: z.number().int(),
  creditAmount: z.number().int(),
  chargedAmount: z.number().int(),
  currency: z.string(),
  paymentMethod: spotlightPaymentMethodSchema,
  paidAt: z.string().nullable(),
  /** Fin du délai pour payer, tant que la place attend son paiement. */
  holdExpiresAt: z.string().nullable(),
  imageUrl: z.string().nullable(),
  video: spotlightVideoSchema.nullable(),
  rejectionReason: z.string().nullable(),
  interruptionReason: z.string().nullable(),
  /** Rendu au solde (refus). */
  refundedAmount: z.number().int(),
  /** Rendu en avoir (jours non diffusés). */
  creditedAmount: z.number().int(),
  stats: spotlightStatsSchema.nullable(),
  canCancel: z.boolean(),
  canPay: z.boolean(),
  /** Un reçu existe dès qu'un montant a été réglé. */
  hasReceipt: z.boolean(),
  requestedByName: z.string(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
});

export type SpotlightBooking = z.infer<typeof spotlightBookingSchema>;

export const spotlightCreditSchema = z.object({
  id: idSchema,
  amount: z.number().int(),
  remaining: z.number().int(),
  currency: z.string(),
  reason: spotlightCreditReasonSchema,
  note: z.string().nullable(),
  bookingReference: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type SpotlightCredit = z.infer<typeof spotlightCreditSchema>;

/** Un jour du calendrier de réservation, vu par un événement. */
export const spotlightCalendarDaySchema = z.object({
  day: z.string(),
  /** Places encore libres ce jour-là, dans le pays. */
  free: z.number().int(),
  capacity: z.number().int(),
  /** Peut entrer dans une réservation pour CET événement. */
  selectable: z.boolean(),
  /** Pourquoi pas, quand ce n'est pas le cas. */
  reason: z.string().nullable(),
});

export type SpotlightCalendarDay = z.infer<typeof spotlightCalendarDaySchema>;

export const SPOTLIGHT_INELIGIBILITY = [
  'SALES_CLOSED',
  'COUNTRY_CLOSED',
  'NOT_VERIFIED',
  'EVENT_NOT_LIVE',
  'EVENT_ENDING',
] as const;

export type SpotlightIneligibility = (typeof SPOTLIGHT_INELIGIBILITY)[number];

/**
 * Tout ce que l'onglet « Mise en avant » d'un événement a besoin de savoir,
 * en une lecture : l'offre, le calendrier, l'avoir, le solde, les places déjà
 * prises et la diapositive telle qu'elle paraîtra.
 */
export const spotlightOfferSchema = z.object({
  eligible: z.boolean(),
  ineligibility: z.enum(SPOTLIGHT_INELIGIBILITY).nullable(),
  /** Phrase à afficher quand la vente n'est pas possible. */
  ineligibilityMessage: z.string().nullable(),
  countryCode: z.string(),
  currency: z.string(),
  pricePerDay: z.number().int().nullable(),
  paidSlotsPerDay: z.number().int(),
  minLeadDays: z.number().int(),
  maxDaysPerBooking: z.number().int(),
  reviewHours: z.number().int(),
  holdMinutes: z.number().int(),
  calendar: z.array(spotlightCalendarDaySchema),
  creditAvailable: z.number().int(),
  credits: z.array(spotlightCreditSchema),
  /** Solde disponible, pour qui peut le dépenser ; `null` sinon. */
  balanceAvailable: z.number().int().nullable(),
  /** Le membre peut-il payer avec le solde (il faut le droit de retirer) ? */
  canPayWithBalance: z.boolean(),
  /** Mobile Money ou carte sont-ils ouverts dans ce pays ? */
  providerAvailable: z.boolean(),
  /** Les moyens proposés dans la fenêtre du prestataire, dans l'ordre du pays. */
  providerMethods: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      kind: z.string(),
      logo: z.string().nullable(),
    }),
  ),
  /** La diapositive, telle que la une la montrera (couverture de l'événement). */
  preview: spotlightSlideSchema,
  bookings: z.array(spotlightBookingSchema),
});

export type SpotlightOffer = z.infer<typeof spotlightOfferSchema>;

/** Résultat d'une demande : la place, et l'état du paiement à mener s'il en reste un. */
export interface SpotlightBookingCreated {
  booking: SpotlightBooking;
  /** `true` : il reste à payer dans la fenêtre du prestataire. */
  awaitingPayment: boolean;
}

/** Une place, vue par la console : de quoi décider sans changer d'écran. */
export const spotlightBookingAdminSchema = spotlightBookingSchema.extend({
  organization: z.object({ id: idSchema, name: z.string(), verified: z.boolean() }),
  event: z.object({
    id: idSchema,
    slug: z.string(),
    title: z.string(),
    startsAt: z.string(),
    status: z.string(),
    coverImageUrl: z.string().nullable(),
  }),
  spotlightId: idSchema.nullable(),
  reviewedByName: z.string().nullable(),
  /** La diapositive telle qu'elle paraîtra, visuel propre compris. */
  preview: spotlightSlideSchema.nullable(),
});

export type SpotlightBookingAdmin = z.infer<typeof spotlightBookingAdminSchema>;

export interface SpotlightAdminOverview {
  settings: SpotlightSettings;
  countries: Array<{
    code: string;
    name: string;
    flag: string;
    isDefault: boolean;
    currency: string;
  }>;
  items: SpotlightAdmin[];
  bookings: {
    /** En attente de la décision de l'équipe, les plus anciennes d'abord. */
    pending: SpotlightBookingAdmin[];
    /** Les autres, les plus récentes d'abord. */
    recent: SpotlightBookingAdmin[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcul partagé
// ─────────────────────────────────────────────────────────────────────────────

/** La phase, calculée de la même façon par l'API et par l'écran. */
export function computeSpotlightPhase(
  spotlight: { status: 'ACTIVE' | 'WITHDRAWN'; startsAt: Date; endsAt: Date },
  now: Date,
): SpotlightPhase {
  if (spotlight.status === 'WITHDRAWN') return 'WITHDRAWN';
  if (spotlight.endsAt <= now) return 'ENDED';
  if (spotlight.startsAt > now) return 'SCHEDULED';
  return 'LIVE';
}
