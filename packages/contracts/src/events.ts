/**
 * Contrat des événements et de la billetterie.
 *
 * La page événement est la page la plus importante du produit : c'est elle qui
 * reçoit le trafic WhatsApp et qui convertit.
 */

import { z } from 'zod';
import { amountSchema, idSchema, isoDateSchema, slugSchema } from './common.js';
import {
  eventFormatSchema,
  eventStatusSchema,
  eventVisibilitySchema,
  refundPolicySchema,
  ticketTypeStatusSchema,
  ticketVisibilitySchema,
  type EventStatus,
} from './enums.js';

/** Limite affichée dans l'assistant : au-delà, le titre est tronqué sur mobile. */
export const EVENT_TITLE_MAX_LENGTH = 80;

/** L'assistant de création compte huit étapes. */
export const EVENT_WIZARD_STEPS = [
  { step: 1, key: 'general', label: 'Informations générales' },
  { step: 2, key: 'schedule', label: 'Date et heure' },
  { step: 3, key: 'location', label: 'Lieu' },
  { step: 4, key: 'media', label: 'Visuels' },
  { step: 5, key: 'tickets', label: 'Billets' },
  { step: 6, key: 'settings', label: 'Paramètres' },
  { step: 7, key: 'preview', label: 'Aperçu' },
  { step: 8, key: 'publish', label: 'Publication' },
] as const;

export type EventWizardStep = (typeof EVENT_WIZARD_STEPS)[number]['key'];

// ─────────────────────────────────────────────────────────────────────────────
// Machine à états
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transitions autorisées.
 *
 * Un état absent de cette table est un état terminal. Toute transition non
 * listée est refusée : c'est ce qui empêche, par exemple, de « republier » un
 * événement annulé dont les billets ont déjà été remboursés.
 *
 * Voir docs/DATABASE_PROPOSAL.md §11.1.
 */
export const EVENT_STATUS_TRANSITIONS: Readonly<Record<EventStatus, readonly EventStatus[]>> = {
  DRAFT: ['PENDING_REVIEW', 'PUBLISHED', 'CANCELLED'],
  /**
   * `PENDING_REVIEW → DRAFT` et `PUBLISHED → DRAFT` : la DÉPUBLICATION.
   *
   * Un organisateur qui a publié trop tôt — mauvaise date, visuel manquant —
   * retire son événement de la découverte et le reprend dans l'assistant.
   * Le service n'autorise ce retour que tant qu'aucun billet n'a été vendu :
   * au-delà, seule l'annulation (avec remboursement) retire un événement.
   */
  PENDING_REVIEW: ['PUBLISHED', 'REJECTED', 'CANCELLED', 'DRAFT'],
  REJECTED: ['DRAFT', 'PENDING_REVIEW'],
  PUBLISHED: ['SOLD_OUT', 'POSTPONED', 'CANCELLED', 'COMPLETED', 'DRAFT'],
  SOLD_OUT: ['PUBLISHED', 'POSTPONED', 'CANCELLED', 'COMPLETED'],
  POSTPONED: ['PUBLISHED', 'CANCELLED'],
  CANCELLED: [],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  return EVENT_STATUS_TRANSITIONS[from].includes(to);
}

/** États dans lesquels un événement est visible du public. */
export const PUBLICLY_VISIBLE_STATUSES: readonly EventStatus[] = ['PUBLISHED', 'SOLD_OUT'];

export function isPubliclyVisible(status: EventStatus): boolean {
  return PUBLICLY_VISIBLE_STATUSES.includes(status);
}

/**
 * Décide du chemin de publication.
 *
 * Résout l'ambiguïté A5 : un organisateur vérifié qui a déjà publié passe
 * directement en ligne ; un premier événement ou une organisation non vérifiée
 * passe par une revue. On ne freine pas l'activité établie, on contrôle
 * l'entrée.
 */
export function resolvePublicationTarget(input: {
  isVerifiedOrganization: boolean;
  publishedEventsCount: number;
}): Extract<EventStatus, 'PUBLISHED' | 'PENDING_REVIEW'> {
  return input.isVerifiedOrganization && input.publishedEventsCount > 0
    ? 'PUBLISHED'
    : 'PENDING_REVIEW';
}

// ─────────────────────────────────────────────────────────────────────────────
// Carte des événements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un événement sur la carte : juste ce qu'il faut pour poser une épingle et
 * remplir la fiche qui s'ouvre au clic. Le détail complet reste sur la page de
 * l'événement — la carte sert à choisir, pas à lire.
 */
export const eventMapPinSchema = z.object({
  id: idSchema,
  slug: z.string(),
  title: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  startsAt: z.string(),
  endsAt: z.string(),
  categoryName: z.string(),
  /** Slug de la catégorie : c'est lui qui choisit l'icône de l'épingle. */
  categorySlug: z.string(),
  categoryColor: z.string(),
  coverImageUrl: z.string().nullable(),
  venueName: z.string().nullable(),
  address: z.string().nullable(),
  cityName: z.string().nullable(),
  /** Prix le plus bas, 0 pour un événement gratuit, null sans billet visible. */
  fromPrice: z.number().int().nullable(),
  isSoldOut: z.boolean(),
});

export type EventMapPin = z.infer<typeof eventMapPinSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Disponibilité des billets
// ─────────────────────────────────────────────────────────────────────────────

export interface TicketAvailabilityInput {
  readonly quantityTotal: number;
  readonly quantitySold: number;
  readonly quantityReserved: number;
  readonly status: z.infer<typeof ticketTypeStatusSchema>;
  readonly salesStartAt?: Date | null;
  readonly salesEndAt?: Date | null;
}

export type TicketAvailabilityReason =
  'available' | 'sold_out' | 'not_started' | 'ended' | 'paused' | 'closed';

export interface TicketAvailability {
  readonly available: boolean;
  readonly remaining: number;
  readonly reason: TicketAvailabilityReason;
  /** Message destiné au participant, jamais un code brut. */
  readonly label: string;
}

/**
 * Disponibilité d'une catégorie de billet.
 *
 * Le stock restant tient compte des réservations en cours : une place retenue
 * pendant un paiement Mobile Money n'est plus vendable, même si elle n'est pas
 * encore payée.
 */
export function computeTicketAvailability(
  input: TicketAvailabilityInput,
  now: Date = new Date(),
): TicketAvailability {
  const remaining = Math.max(0, input.quantityTotal - input.quantitySold - input.quantityReserved);

  if (input.status === 'CLOSED') {
    return { available: false, remaining, reason: 'closed', label: 'Clôturé' };
  }

  if (input.status === 'PAUSED') {
    return { available: false, remaining, reason: 'paused', label: 'Vente suspendue' };
  }

  if (input.salesStartAt && now < input.salesStartAt) {
    return { available: false, remaining, reason: 'not_started', label: 'Bientôt en vente' };
  }

  if (input.salesEndAt && now > input.salesEndAt) {
    return { available: false, remaining, reason: 'ended', label: 'Vente terminée' };
  }

  if (remaining <= 0) {
    return { available: false, remaining: 0, reason: 'sold_out', label: 'Épuisé' };
  }

  return { available: true, remaining, reason: 'available', label: 'En vente' };
}

/** Seuil à partir duquel la carte affiche « Bientôt complet ». */
export const ALMOST_SOLD_OUT_RATIO = 0.9;

export function isAlmostSoldOut(input: TicketAvailabilityInput): boolean {
  if (input.quantityTotal === 0) return false;
  const taken = input.quantitySold + input.quantityReserved;
  return taken / input.quantityTotal >= ALMOST_SOLD_OUT_RATIO && taken < input.quantityTotal;
}

/** Nombre maximal de billets achetables en une commande, toutes règles confondues. */
export function maxPurchasableQuantity(input: {
  remaining: number;
  maxPerOrder?: number | null;
  eventMaxTicketsPerOrder?: number | null;
}): number {
  const limits = [input.remaining];
  if (input.maxPerOrder) limits.push(input.maxPerOrder);
  if (input.eventMaxTicketsPerOrder) limits.push(input.eventMaxTicketsPerOrder);
  return Math.max(0, Math.min(...limits));
}

// ─────────────────────────────────────────────────────────────────────────────
// Schémas
// ─────────────────────────────────────────────────────────────────────────────

export const eventGeneralSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Le titre est trop court')
    .max(EVENT_TITLE_MAX_LENGTH, `${EVENT_TITLE_MAX_LENGTH} caractères au maximum`),
  subtitle: z.string().trim().max(160).optional(),
  description: z.string().trim().max(10_000).optional(),
  categoryId: idSchema,
  subcategoryId: idSchema.optional(),
});

export const eventScheduleSchema = z
  .object({
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    doorsOpenAt: isoDateSchema.optional(),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: 'La fin doit venir après le début',
    path: ['endsAt'],
  })
  .refine((value) => !value.doorsOpenAt || value.doorsOpenAt <= value.startsAt, {
    message: "L'ouverture des portes ne peut pas suivre le début",
    path: ['doorsOpenAt'],
  });

export const eventLocationSchema = z
  .object({
    format: eventFormatSchema,
    venueName: z.string().trim().max(160).optional(),
    address: z.string().trim().max(240).optional(),
    cityId: idSchema.optional(),
    /**
     * Coordonnées du lieu, posées par la recherche Google Places.
     *
     * Facultatives : un lieu saisi à la main n'en a pas, et l'événement reste
     * valide — il n'apparaîtra simplement pas sur la carte des participants.
     * Les bornes sont celles du globe ; la saisie manuelle n'existe pas dans
     * l'assistant, elles ne servent qu'à refuser une valeur aberrante.
     */
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    /** Identifiant Google du lieu, pour ne pas créer deux fois le même. */
    googlePlaceId: z.string().trim().max(300).optional(),
    onlineUrl: z.string().url().optional(),
    onlinePlatform: z.string().trim().max(60).optional(),
  })
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    message: 'Latitude et longitude vont ensemble',
    path: ['latitude'],
  })
  .refine((value) => value.format === 'ONLINE' || Boolean(value.cityId), {
    message: 'Indique la ville de l’événement',
    path: ['cityId'],
  })
  .refine((value) => value.format === 'PHYSICAL' || Boolean(value.onlineUrl), {
    message: 'Indique le lien de connexion',
    path: ['onlineUrl'],
  });

export const eventSettingsSchema = z.object({
  visibility: eventVisibilitySchema.default('PUBLIC'),
  refundPolicy: refundPolicySchema.default('UNTIL_DAYS_BEFORE'),
  refundDeadlineDays: z.number().int().min(0).max(90).optional(),
  minimumAge: z.number().int().min(0).max(21).optional(),
  requiresAttendeeName: z.boolean().default(false),
  maxTicketsPerOrder: z.number().int().min(1).max(50).optional(),
  accessInstructions: z.string().trim().max(500).optional(),
});

export const createEventSchema = eventGeneralSchema.partial({ categoryId: true }).extend({
  title: z.string().trim().min(3).max(EVENT_TITLE_MAX_LENGTH),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Mise à jour partielle : l'assistant enregistre étape par étape. */
export const updateEventSchema = z.object({
  general: eventGeneralSchema.partial().optional(),
  schedule: eventScheduleSchema.optional(),
  location: eventLocationSchema.optional(),
  settings: eventSettingsSchema.partial().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  /**
   * Plans du lieu, dans l'ordre d'affichage. Facultatifs.
   *
   * Un festival a un plan des stands, un concert un plan de salle, une
   * conférence rien du tout. La liste complète remplace la précédente : c'est
   * l'assistant qui la tient, et une liste vide retire tous les plans.
   */
  floorPlanUrls: z.array(z.string().url()).max(5).optional(),
  /** Étape courante, pour reprendre exactement là où l'organisateur s'est arrêté. */
  draftStep: z.number().int().min(1).max(8).optional(),
});

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const ticketTypeInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Nomme cette catégorie').max(80),
    description: z.string().trim().max(500).optional(),
    price: amountSchema,
    quantityTotal: z.number().int().min(1, 'Indique au moins une place').max(1_000_000),
    minPerOrder: z.number().int().min(1).max(50).default(1),
    maxPerOrder: z.number().int().min(1).max(50).optional(),
    salesStartAt: isoDateSchema.optional(),
    salesEndAt: isoDateSchema.optional(),
    visibility: ticketVisibilitySchema.default('PUBLIC'),
    accessCode: z.string().trim().max(40).optional(),
  })
  .refine((value) => !value.maxPerOrder || value.maxPerOrder >= value.minPerOrder, {
    message: 'Le maximum doit être supérieur ou égal au minimum',
    path: ['maxPerOrder'],
  })
  .refine(
    (value) => !value.salesEndAt || !value.salesStartAt || value.salesEndAt > value.salesStartAt,
    {
      message: 'La fin des ventes doit suivre leur début',
      path: ['salesEndAt'],
    },
  );

export type TicketTypeInput = z.infer<typeof ticketTypeInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Représentations
// ─────────────────────────────────────────────────────────────────────────────

export const ticketTypeSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().int(),
  currency: z.string(),
  quantityTotal: z.number().int(),
  quantitySold: z.number().int(),
  remaining: z.number().int(),
  minPerOrder: z.number().int(),
  maxPerOrder: z.number().int().nullable(),
  salesStartAt: z.string().nullable(),
  salesEndAt: z.string().nullable(),
  status: ticketTypeStatusSchema,
  visibility: ticketVisibilitySchema,
  available: z.boolean(),
  availabilityLabel: z.string(),
});

export type TicketTypeView = z.infer<typeof ticketTypeSchema>;

export const eventSummarySchema = z.object({
  id: idSchema,
  slug: slugSchema,
  shortCode: z.string(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: eventStatusSchema,
  visibility: eventVisibilitySchema,
  coverImageUrl: z.string().nullable(),
  categoryName: z.string(),
  /** Slug de la catégorie, pour l'icône qui l'accompagne partout. */
  categorySlug: z.string(),
  categoryColor: z.string(),
  cityName: z.string().nullable(),
  /** Pays de l'événement — fixe la devise et les moyens de paiement du tunnel. */
  countryCode: z.string(),
  currency: z.string(),
  venueName: z.string().nullable(),
  /** Coordonnées du lieu, quand il a été localisé. */
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  organizationName: z.string(),
  organizationSlug: z.string(),
  /** Prix du billet le moins cher. `0` pour un événement gratuit, `null` si aucun billet. */
  fromPrice: z.number().int().nullable(),
  /** Frais annoncés dès la carte : « 5 000 FCFA + 250 de frais ». */
  feeAmount: z.number().int().nullable(),
  remainingSeats: z.number().int().nullable(),
  isSoldOut: z.boolean(),
  isAlmostSoldOut: z.boolean(),
  minimumAge: z.number().int().nullable(),
  /**
   * Étape de l'assistant où l'organisateur s'est arrêté, de 1 à 8.
   *
   * Servi à l'organisateur seulement : la découverte publique ne le porte pas.
   * C'est ce qui permet à la liste de dire « reprendre à l'étape 3 » et à
   * l'assistant de rouvrir là où le brouillon a été laissé, comme il le promet.
   */
  draftStep: z.number().int().min(1).max(8).optional(),
  /**
   * Billets vendus, toutes catégories confondues — vue organisateur seulement.
   * C'est ce qui décide, sur la carte de la liste, si « Dépublier » et
   * « Supprimer » sont possibles : un événement qui a vendu ne se retire
   * qu'en s'annulant.
   */
  ticketsSold: z.number().int().optional(),
});

export type EventSummary = z.infer<typeof eventSummarySchema>;

export const eventDetailSchema = eventSummarySchema.extend({
  subtitle: z.string().nullable(),
  description: z.string().nullable(),
  format: eventFormatSchema,
  doorsOpenAt: z.string().nullable(),
  address: z.string().nullable(),
  onlinePlatform: z.string().nullable(),
  refundPolicy: refundPolicySchema,
  refundDeadlineDays: z.number().int().nullable(),
  requiresAttendeeName: z.boolean(),
  maxTicketsPerOrder: z.number().int().nullable(),
  accessInstructions: z.string().nullable(),
  /** Plans du lieu déposés par l'organisateur. Vide : « aucun plan disponible ». */
  floorPlanUrls: z.array(z.string()),
  organizationLogoUrl: z.string().nullable(),
  organizationVerified: z.boolean(),
  ticketTypes: z.array(ticketTypeSchema),
});

export type EventDetail = z.infer<typeof eventDetailSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Découverte
// ─────────────────────────────────────────────────────────────────────────────

export const DISCOVERY_DATE_FILTERS = ['today', 'this_week', 'this_weekend', 'this_month'] as const;

export type DiscoveryDateFilter = (typeof DISCOVERY_DATE_FILTERS)[number];

export const discoveryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  ville: z.string().trim().max(80).optional(),
  cat: z.string().trim().max(80).optional(),
  date: z.enum(DISCOVERY_DATE_FILTERS).optional(),
  /** `gratuit`, `payant`, ou rien. */
  prix: z.enum(['gratuit', 'payant']).optional(),
  format: eventFormatSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

/** Bornes de date correspondant à un filtre de découverte. */
export function resolveDateRange(
  filter: DiscoveryDateFilter | undefined,
  now: Date = new Date(),
): { from: Date; to: Date } | null {
  if (!filter) return null;

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = (date: Date) => {
    const value = new Date(date);
    value.setHours(23, 59, 59, 999);
    return value;
  };

  switch (filter) {
    case 'today':
      return { from: startOfDay, to: endOfDay(startOfDay) };

    case 'this_week': {
      // La semaine française commence le lundi.
      const day = (startOfDay.getDay() + 6) % 7;
      const monday = new Date(startOfDay);
      monday.setDate(startOfDay.getDate() - day);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: startOfDay > monday ? startOfDay : monday, to: endOfDay(sunday) };
    }

    case 'this_weekend': {
      const day = (startOfDay.getDay() + 6) % 7;
      const saturday = new Date(startOfDay);
      saturday.setDate(startOfDay.getDate() + (5 - day));
      const sunday = new Date(saturday);
      sunday.setDate(saturday.getDate() + 1);
      return { from: startOfDay > saturday ? startOfDay : saturday, to: endOfDay(sunday) };
    }

    case 'this_month': {
      const last = new Date(startOfDay.getFullYear(), startOfDay.getMonth() + 1, 0);
      return { from: startOfDay, to: endOfDay(last) };
    }
  }
}
