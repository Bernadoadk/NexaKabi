import { BENIN_TIMEZONE } from '@nexakabi/utils';

/**
 * Outils partagés des écrans Finance.
 *
 * Les périodes se comptent en jours de Porto-Novo, comme côté API : un
 * encaissement de 23 h 30 appartient au jour qui se termine.
 */

/** Aujourd'hui à Porto-Novo, au format AAAA-MM-JJ. */
export function todayInBenin(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BENIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Décale une date AAAA-MM-JJ d'un nombre de jours, sans passer par un fuseau. */
function shiftDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export interface PeriodPreset {
  label: string;
  from: string;
  to: string;
}

/** Les périodes qu'on demande le plus : ce mois, le précédent, trente jours, l'année. */
export function periodPresets(today = todayInBenin()): PeriodPreset[] {
  const monthStart = `${today.slice(0, 7)}-01`;
  const previousMonthEnd = shiftDays(monthStart, -1);
  const previousMonthStart = `${previousMonthEnd.slice(0, 7)}-01`;

  return [
    { label: 'Ce mois', from: monthStart, to: today },
    { label: 'Mois dernier', from: previousMonthStart, to: previousMonthEnd },
    { label: '30 jours', from: shiftDays(today, -29), to: today },
    { label: 'Cette année', from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

/** Chaîne de requête, sans les paramètres vides. */
export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Une part, en pourcentage à une décimale : « 2,9 % ». */
export function formatShare(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${((part / whole) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/** « 12 sept. 2026 » depuis AAAA-MM-JJ. */
export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
