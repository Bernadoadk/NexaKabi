/**
 * Dates de la une, toujours à l'heure de Porto-Novo.
 *
 * ── Pourquoi un fuseau explicite ────────────────────────────────────────────
 * Le formulaire est rendu une première fois sur le serveur (en UTC sur
 * Vercel), puis dans le navigateur. Une date convertie « dans le fuseau
 * local » n'y donnerait pas la même heure, et le champ changerait de valeur
 * sous les yeux de l'administrateur. Le Bénin est à UTC+1 toute l'année, sans
 * heure d'été : la conversion est exacte dans les deux sens.
 */

const TIME_ZONE = 'Africa/Porto-Novo';
const OFFSET = '+01:00';

const inputFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const labelFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** ISO → valeur d'un `<input type="datetime-local">` : « 2026-11-21T20:00 ». */
export function toLocalInput(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '';
  return inputFormat.format(date).replace(' ', 'T');
}

/** Valeur d'un `datetime-local`, lue à l'heure de Porto-Novo → ISO. `null` si vide. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00${OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** « 21 nov., 20:00 » — pour les listes. */
export function formatPortoNovo(iso: string): string {
  return labelFormat.format(new Date(iso));
}
