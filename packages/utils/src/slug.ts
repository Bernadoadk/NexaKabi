/**
 * Slugs d'URL.
 *
 * Les slugs d'événement et d'organisation apparaissent dans des liens partagés
 * sur WhatsApp (`nexakabi.bj/e/yele-2026`). Ils doivent rester courts, lisibles,
 * et translittérer correctement les diacritiques françaises.
 *
 * Un slug est IMMUABLE après publication : un renommage crée une redirection,
 * jamais une modification. Voir docs/PROJECT_ANALYSIS.md §5.3.
 */

const MAX_SLUG_LENGTH = 60;

/**
 * @example slugify('Festival Yélé · 3e édition') === 'festival-yele-3e-edition'
 */
export function slugify(input: string, maxLength = MAX_SLUG_LENGTH): string {
  const slug = input
    .normalize('NFD')
    // Supprime les diacritiques (é → e, ô → o, ç → c via la décomposition).
    .replace(/[̀-ͯ]/g, '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= maxLength) return slug;

  // Tronquer sur une frontière de mot pour éviter un slug coupé au milieu.
  const truncated = slug.slice(0, maxLength);
  const lastDash = truncated.lastIndexOf('-');
  return lastDash > maxLength / 2 ? truncated.slice(0, lastDash) : truncated;
}

/**
 * Rend un slug unique en suffixant un discriminant, lorsqu'il est déjà pris.
 *
 * @example uniqueSlug('festival-yele', ['festival-yele']) === 'festival-yele-2'
 */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;

  let suffix = 2;
  while (taken.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= MAX_SLUG_LENGTH;
}
