/**
 * Contrat des notifications.
 *
 * ── Quatre types, et pas un de plus ─────────────────────────────────────────
 * Le prototype est catégorique : « aucune notification promotionnelle non
 * sollicitée ». Chaque type ci-dessous correspond à quelque chose que le
 * participant a demandé — en achetant, en suivant, en s'inscrivant — et chacun
 * porte une action.
 *
 * Une cinquième catégorie serait la première marche vers le centre de
 * notifications que personne n'ouvre. La liste est donc fermée, et le rester
 * est une décision produit, pas une limite technique.
 */

import { z } from 'zod';
import { idSchema } from './common.js';
import { notificationTypeSchema, type NotificationType } from './enums.js';

/**
 * Les quatre types vivent dans `enums.js`, avec le reste des énumérations
 * partagées. Ce fichier ne les redéfinit pas : il leur donne des libellés, des
 * règles et des messages.
 */
export const NOTIFICATION_LABELS: Readonly<Record<NotificationType, string>> = {
  PAYMENT_CONFIRMED: 'Paiement confirmé',
  EVENT_REMINDER: 'Rappel d’événement',
  EVENT_UPDATED: 'Information modifiée',
  ORGANIZER_PUBLISHED: 'Nouvel événement',
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
 * `PAYMENT_CONFIRMED` et `EVENT_CHANGED` sont transactionnels : ils portent une
 * information que le participant DOIT recevoir — son billet, ou une annulation.
 * Les rendre optionnels reviendrait à laisser quelqu'un se présenter devant une
 * salle fermée.
 */
export const MANDATORY_TYPES: readonly NotificationType[] = ['PAYMENT_CONFIRMED', 'EVENT_UPDATED'];

export function isMandatory(type: NotificationType): boolean {
  return MANDATORY_TYPES.includes(type);
}

export const notificationPreferencesSchema = z.object({
  eventReminders: z.boolean().default(true),
  organizerPublications: z.boolean().default(false),
  /** Canaux acceptés en plus de l'in-app, qui est toujours actif. */
  whatsapp: z.boolean().default(true),
  sms: z.boolean().default(true),
  email: z.boolean().default(false),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

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
