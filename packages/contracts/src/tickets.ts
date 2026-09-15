/**
 * Contrat du billet.
 *
 * Le billet est l'objet que le participant possède réellement : c'est lui qu'il
 * montre à la porte, qu'il envoie à un ami, qu'il retrouve trois semaines plus
 * tard sans réseau. Tout ce qui figure ici doit pouvoir tenir dans un cache
 * hors ligne, sans appel supplémentaire.
 */

import { z } from 'zod';
import { idSchema, publicTokenSchema, ticketReferenceSchema } from './common.js';
import { ticketStatusSchema } from './enums.js';

export const ticketSchema = z.object({
  id: idSchema,
  reference: ticketReferenceSchema,
  status: ticketStatusSchema,

  /** Jeton du lien public `/t/[token]`. Distinct du contenu du QR. */
  accessToken: publicTokenSchema,
  /** Jeton complet à encoder : `NK1.<charge>.<signature>`. */
  qrToken: z.string(),
  qrExpiresAt: z.string(),

  attendeeName: z.string(),
  ticketTypeName: z.string(),

  eventId: idSchema,
  eventSlug: z.string(),
  eventTitle: z.string(),
  eventStartsAt: z.string(),
  eventEndsAt: z.string(),
  eventDoorsOpenAt: z.string().nullable(),
  eventVenueName: z.string().nullable(),
  eventAddress: z.string().nullable(),
  eventCityName: z.string().nullable(),
  eventCoverImageUrl: z.string().nullable(),
  /** « Fouille à l'entrée · boissons extérieures interdites ». */
  eventAccessInstructions: z.string().nullable(),

  orderReference: z.string(),
  issuedAt: z.string(),
  usedAt: z.string().nullable(),
});

export type Ticket = z.infer<typeof ticketSchema>;

/**
 * Regroupement par événement, pour l'écran « Mes billets ».
 *
 * Le prototype présente une carte par événement, pas une carte par billet :
 * quelqu'un qui a pris quatre places pour le même concert n'a pas quatre
 * choses à gérer, il en a une.
 */
export const ticketGroupSchema = z.object({
  eventId: idSchema,
  eventSlug: z.string(),
  eventTitle: z.string(),
  eventStartsAt: z.string(),
  eventVenueName: z.string().nullable(),
  eventCityName: z.string().nullable(),
  eventCoverImageUrl: z.string().nullable(),
  tickets: z.array(ticketSchema),
});

export type TicketGroup = z.infer<typeof ticketGroupSchema>;

/** Onglets de l'écran « Mes billets ». */
export const TICKET_TABS = ['upcoming', 'used', 'cancelled'] as const;
export const ticketTabSchema = z.enum(TICKET_TABS);
export type TicketTab = z.infer<typeof ticketTabSchema>;

export const TICKET_TAB_LABELS: Readonly<Record<TicketTab, string>> = {
  upcoming: 'À venir',
  used: 'Utilisés',
  cancelled: 'Annulés',
};

/**
 * Onglet dans lequel un billet doit apparaître.
 *
 * Un billet valide dont l'événement est passé n'est pas « à venir » : il
 * rejoint « utilisés », qui signifie en réalité « terminés ». Le laisser dans
 * « à venir » ferait croire à un événement encore à honorer.
 */
export function resolveTicketTab(
  ticket: { status: z.infer<typeof ticketStatusSchema>; eventEndsAt: string },
  now: Date = new Date(),
): TicketTab {
  if (ticket.status === 'CANCELLED' || ticket.status === 'REFUNDED') return 'cancelled';
  if (ticket.status === 'USED' || ticket.status === 'EXPIRED') return 'used';

  return new Date(ticket.eventEndsAt).getTime() < now.getTime() ? 'used' : 'upcoming';
}

/**
 * Le QR doit-il être affiché ?
 *
 * Un billet annulé conserve sa page — le participant doit pouvoir constater
 * l'annulation — mais son QR disparaît : le montrer inviterait à tenter
 * l'entrée, et à essuyer un refus devant tout le monde.
 */
export function shouldShowQr(status: z.infer<typeof ticketStatusSchema>): boolean {
  return status === 'VALID' || status === 'USED';
}

/** Libellé d'état, tel qu'affiché sur le billet. */
export const TICKET_STATUS_LABELS: Readonly<Record<z.infer<typeof ticketStatusSchema>, string>> = {
  VALID: 'Valide',
  USED: 'Déjà utilisé',
  CANCELLED: 'Annulé',
  REFUNDED: 'Remboursé',
  EXPIRED: 'Expiré',
};

/**
 * Message WhatsApp pré-rédigé pour partager un billet.
 *
 * Pré-remplir le texte double le taux de partage : il ne reste qu'à choisir le
 * destinataire. Le lien porte le jeton d'accès, jamais le contenu du QR.
 */
export function buildTicketShareUrl(input: {
  siteUrl: string;
  accessToken: string;
  eventTitle: string;
}): string {
  const link = `${input.siteUrl}/t/${input.accessToken}`;
  const text = `Voici mon billet pour ${input.eventTitle} — ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Taille minimale du QR à l'écran, en pixels. Exigence du prototype. */
export const QR_MIN_DISPLAY_SIZE = 176;
