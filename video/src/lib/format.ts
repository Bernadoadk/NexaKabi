import { format, isSameDay, isSameMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { config } from '../config';
import type { DemoEvent } from '../config.types';

/**
 * Formats de l'application, repris à l'identique
 * (`packages/utils/src/money.ts` et `date.ts`).
 */

/** Espace insécable, séparateur de milliers de la direction artistique. */
export const NBSP = ' ';

const locale = { locale: fr };

/** « 15 000 », « −2 000 » (signe moins typographique). */
export function formatAmount(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return rounded < 0 ? `−${grouped}` : grouped;
}

export function formatMoney(amount: number): string {
  return `${formatAmount(amount)}${NBSP}FCFA`;
}

/** « 2026-12-19 18:00 » → Date, à l'heure locale (pas de décalage de fuseau). */
export function parseDate(value: string): Date {
  const [day, time = '00:00'] = value.split(' ');
  const [year, month, date] = day.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, date, hours, minutes);
}

/** « sam. 19 décembre » */
export const formatEventCaption = (date: Date) => format(date, 'EEE d MMMM', locale);

/** « 18h00 » */
export const formatTimeCompact = (date: Date) => format(date, "HH'h'mm", locale);

/** « sam. 19 décembre · 18h00 » */
export const formatEventCaptionWithTime = (date: Date) =>
  `${formatEventCaption(date)} · ${formatTimeCompact(date)}`;

/** « 17 h 00 » */
export const formatTimeSpaced = (date: Date) => format(date, "HH 'h' mm", locale);

/** « 14 déc. 2026 » */
export const formatDateShort = (date: Date) => format(date, 'd MMM yyyy', locale);

/** « sam. 19 & dim. 20 décembre 2026 · 18h00 → 23h00 » */
export function formatEventRange(start: Date, end: Date): string {
  const time = `${formatTimeCompact(start)} → ${formatTimeCompact(end)}`;
  if (isSameDay(start, end)) return `${format(start, 'EEE d MMMM yyyy', locale)} · ${time}`;
  if (isSameMonth(start, end)) {
    return `${format(start, 'EEE d', locale)} & ${format(end, 'EEE d MMMM yyyy', locale)} · ${time}`;
  }
  return `${format(start, 'EEE d MMM', locale)} → ${format(end, 'EEE d MMM yyyy', locale)} · ${time}`;
}

/**
 * Frais de service : 5 % du sous-total, 100 FCFA minimum par commande, rien
 * sur un événement gratuit (`packages/contracts/src/fees.ts`).
 */
export function serviceFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return Math.max(100, Math.round(subtotal * 0.05));
}

/** Les quatre derniers caractères d'une référence, comme au scanner. */
export const referenceSuffix = (reference: string) => reference.replace(/-/g, '').slice(-4);

export function findEvent(id: string): DemoEvent {
  const event = config.data.events.find((entry) => entry.id === id);
  if (!event) throw new Error(`Événement « ${id} » introuvable dans config.data.events`);
  return event;
}

export const heroEvent = () => findEvent(config.data.heroEventId);

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
