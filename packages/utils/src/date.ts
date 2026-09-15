/**
 * Dates et heures, en français.
 *
 * Formats relevés dans le prototype de référence :
 *   Caption carte    « Sam. 14 mars · 18h00 »
 *   Page événement   « Sam. 14 & dim. 15 mars 2026 · 18h00 → 02h00 »
 *   Billet           « 17 h 30 »
 *   Table            « 9 mars 2026 »
 *
 * Le Bénin est à UTC+1 toute l'année, sans heure d'été. Les dates sont
 * néanmoins stockées en UTC et converties à l'affichage.
 */

import { format, formatDistanceToNowStrict, isSameDay, isSameMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

export const BENIN_TIMEZONE = 'Africa/Porto-Novo';

const withLocale = { locale: fr } as const;

/** « sam. 14 mars » — sur-titre de carte, mis en majuscules par le CSS. */
export function formatEventCaption(date: Date): string {
  return format(date, 'EEE d MMMM', withLocale);
}

/** « sam. 14 mars · 18h00 » — sur-titre complet de carte d'événement. */
export function formatEventCaptionWithTime(date: Date): string {
  return `${formatEventCaption(date)} · ${formatTimeCompact(date)}`;
}

/** « 14 mars 2026 » */
export function formatDateLong(date: Date): string {
  return format(date, 'd MMMM yyyy', withLocale);
}

/** « 9 mars 2026 » en version courte pour les tables : « 9 mars 2026 ». */
export function formatDateShort(date: Date): string {
  return format(date, 'd MMM yyyy', withLocale);
}

/** « 18h00 » — format compact utilisé dans les listes. */
export function formatTimeCompact(date: Date): string {
  return format(date, "HH'h'mm", withLocale);
}

/** « 18 h 00 » — format aéré utilisé sur le billet et les fiches. */
export function formatTimeSpaced(date: Date): string {
  return format(date, "HH 'h' mm", withLocale);
}

/**
 * Plage d'un événement, en factorisant ce qui est commun aux deux dates.
 *
 * @example même jour   « sam. 14 mars 2026 · 18h00 → 02h00 »
 * @example même mois   « sam. 14 & dim. 15 mars 2026 · 18h00 → 02h00 »
 * @example mois requis « sam. 28 févr. → mar. 3 mars 2026 · 18h00 »
 */
export function formatEventRange(start: Date, end: Date): string {
  const time = `${formatTimeCompact(start)} → ${formatTimeCompact(end)}`;

  if (isSameDay(start, end)) {
    return `${format(start, 'EEE d MMMM yyyy', withLocale)} · ${time}`;
  }

  if (isSameMonth(start, end)) {
    const startPart = format(start, 'EEE d', withLocale);
    const endPart = format(end, 'EEE d MMMM yyyy', withLocale);
    return `${startPart} & ${endPart} · ${time}`;
  }

  const startPart = format(start, 'EEE d MMM', withLocale);
  const endPart = format(end, 'EEE d MMM yyyy', withLocale);
  return `${startPart} → ${endPart} · ${time}`;
}

/** « dans 4 jours », « il y a 2 heures » — utilisé par les cartes et les notifications. */
export function formatRelative(date: Date): string {
  return formatDistanceToNowStrict(date, { locale: fr, addSuffix: true });
}

/** Pastille de date des cartes compactes : { month: 'Mar', day: '14' }. */
export function formatDateChip(date: Date): { month: string; day: string } {
  return {
    month: format(date, 'MMM', withLocale).replace('.', ''),
    day: format(date, 'd', withLocale),
  };
}

/** Valeur `datetime` d'une balise `<time>`, pour le SEO et l'accessibilité. */
export function toIsoString(date: Date): string {
  return date.toISOString();
}

/** Compte à rebours « 2 min 04 » de l'écran d'attente Mobile Money. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes} min ${String(seconds).padStart(2, '0')}`;
}

/** Compte à rebours court « 0:42 » de l'écran de saisie du code OTP. */
export function formatShortCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
