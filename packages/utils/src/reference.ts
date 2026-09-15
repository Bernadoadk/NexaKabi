/**
 * Génération des références lisibles par un humain.
 *
 * Format relevé dans le prototype de référence :
 *   Commande : NK-8F4C21   (également NK-8F51A0, NK-8F4F02, NK-6A9042)
 *   Billet   : NK-8F4C21-01
 *
 * Les quatre références du prototype sont hexadécimales en majuscules :
 * l'alphabet retenu est donc `0-9A-F`, sur 6 caractères, soit ~16,7 millions
 * de combinaisons. L'unicité n'est pas garantie par la génération mais par
 * l'index unique en base, avec réessai en cas de collision.
 *
 * La recherche manuelle du contrôleur porte sur les 4 derniers caractères.
 * Voir docs/PROJECT_ANALYSIS.md §6.4.
 */

/** Alphabet hexadécimal majuscule, conforme aux références du prototype. */
export const REFERENCE_ALPHABET = '0123456789ABCDEF' as const;

export const ORDER_REFERENCE_PREFIX = 'NK';
export const ORDER_REFERENCE_LENGTH = 6;
export const ORDER_REFERENCE_PATTERN = /^NK-[0-9A-F]{6}$/;
export const TICKET_REFERENCE_PATTERN = /^NK-[0-9A-F]{6}-\d{2}$/;

/**
 * Confusions de saisie ramenées vers l'alphabet valide.
 * L'alphabet hexadécimal ne contient ni O, ni I, ni L : une occurrence est
 * nécessairement une erreur de lecture, corrigée vers le chiffre visuellement
 * équivalent.
 */
const INPUT_CORRECTIONS: Readonly<Record<string, string>> = {
  O: '0',
  Q: '0',
  I: '1',
  L: '1',
  S: '5',
  Z: '2',
  G: '6',
};

/**
 * Génère une référence de commande : `NK-8F4C21`.
 *
 * @param random source aléatoire injectable, pour rendre les tests déterministes
 */
export function generateOrderReference(random: () => number = Math.random): string {
  return `${ORDER_REFERENCE_PREFIX}-${randomString(ORDER_REFERENCE_LENGTH, random)}`;
}

/**
 * Dérive la référence d'un billet depuis celle de sa commande : `NK-8F4C21-01`.
 *
 * @param index position du billet dans la commande, à partir de 1
 */
export function buildTicketReference(orderReference: string, index: number): string {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(`Index de billet invalide : ${index}`);
  }
  return `${orderReference}-${String(index).padStart(2, '0')}`;
}

/**
 * Suffixe utilisé par la recherche manuelle du contrôleur, hors ligne.
 * Sur `NK-8F4C21-01`, renvoie `2101`.
 */
export function referenceSuffix(reference: string, length = 4): string {
  return reference.replace(/-/g, '').slice(-length);
}

/**
 * Normalise une saisie de référence tapée à la main : majuscules, suppression
 * des séparateurs, correction des confusions de glyphes.
 * Utilisé par la recherche manuelle du contrôleur, souvent dans la pénombre.
 */
export function normalizeReferenceInput(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .map((char) => INPUT_CORRECTIONS[char] ?? char)
    .join('');
}

export function isValidOrderReference(reference: string): boolean {
  return ORDER_REFERENCE_PATTERN.test(reference);
}

export function isValidTicketReference(reference: string): boolean {
  return TICKET_REFERENCE_PATTERN.test(reference);
}

/** Code court d'événement, encodé dans le QR et le lien court `nxk.bj/…`. */
export function generateEventShortCode(random: () => number = Math.random): string {
  return randomString(6, random);
}

function randomString(length: number, random: () => number): string {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(random() * REFERENCE_ALPHABET.length);
    result += REFERENCE_ALPHABET[index] ?? REFERENCE_ALPHABET[0];
  }
  return result;
}
