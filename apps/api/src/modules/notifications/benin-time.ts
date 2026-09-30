import { BENIN_TIMEZONE } from '@nexakabi/utils';

/**
 * Dates écrites dans un message, à l'heure de Porto-Novo.
 *
 * ── Pourquoi pas les formats de `@nexakabi/utils` ───────────────────────────
 * Ils formatent dans le fuseau du PROCESSUS. Sur un poste béninois, c'est le
 * bon ; sur Vercel, le processus vit en UTC, et « 18h00 » deviendrait « 17h00 »
 * dans une notification envoyée à quelqu'un qui doit être à l'heure. Un
 * message qui part de nos serveurs fixe donc son fuseau lui-même.
 */

const CAPTION = new Intl.DateTimeFormat('fr-FR', {
  timeZone: BENIN_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});

const TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: BENIN_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: BENIN_TIMEZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** « sam. 14 mars · 18h00 » */
export function formatBeninMoment(date: Date): string {
  return `${CAPTION.format(date)} · ${TIME.format(date).replace(':', 'h')}`;
}

/** Heure locale (0-23) à Porto-Novo. */
export function beninHour(date: Date): number {
  return Number(HOUR.format(date));
}
