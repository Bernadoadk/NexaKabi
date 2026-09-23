/**
 * Numéros de téléphone par pays.
 *
 * ── Les utilisateurs ne sont pas forcément béninois ────────────────────────
 * Un participant sénégalais se connecte avec son +221 et paie par Wave avec
 * un numéro à 9 chiffres ; un organisateur ivoirien reçoit sur un numéro à
 * 10 chiffres en +225. Refuser ces numéros au motif qu'ils ne sont pas
 * béninois refuserait la vente elle-même.
 *
 * Ce registre porte la règle de chaque pays. `normalizePhone` (phone.ts) reste
 * la règle du pays PAR DÉFAUT — un numéro saisi sans indicatif est béninois —
 * et `tryNormalizeInternationalPhone` en fait la synthèse : un numéro qui
 * annonce son indicatif suit la règle de son pays.
 *
 * ── Ce que le registre encode ──────────────────────────────────────────────
 * Par pays : l'indicatif international et les longueurs nationales admises.
 * Rien de plus. Les préfixes opérateurs ne sont PAS ici : la portabilité les
 * rend non contractuels, et c'est le moyen de paiement CHOISI par l'acheteur
 * qui décide de l'opérateur, jamais une déduction sur le numéro.
 *
 * Les longueurs viennent des plans de numérotation publics (UIT-T E.164) et
 * s'entendent SANS le zéro de tronc ni l'indicatif.
 */

export interface PhoneCountryRule {
  /** ISO 3166-1 alpha-2 : `BJ`, `CI`, `SN`… */
  readonly countryCode: string;
  /** Nom en français, pour les sélecteurs. */
  readonly name: string;
  /** Indicatif international, sans `+`. */
  readonly dialCode: string;
  /** Longueurs nationales admises. La première est la longueur de référence. */
  readonly nationalLengths: readonly number[];
  /**
   * Préfixe à ajouter devant un numéro saisi à une ancienne longueur, pour
   * les pays qui ont migré leur plan de numérotation. Bénin : `01` devant les
   * 8 chiffres historiques ; Côte d'Ivoire : plan à 10 chiffres depuis 2021,
   * où le préfixe dépend de l'opérateur — donc pas de conversion automatique.
   */
  readonly legacy?: { readonly length: number; readonly prefix: string };
  /** Drapeau, pour l'affichage devant l'indicatif. */
  readonly flag: string;
}

const RULES: readonly PhoneCountryRule[] = [
  {
    countryCode: 'BJ',
    name: 'Bénin',
    dialCode: '229',
    nationalLengths: [10],
    legacy: { length: 8, prefix: '01' },
    flag: '🇧🇯',
  },
  { countryCode: 'CI', name: 'Côte d’Ivoire', dialCode: '225', nationalLengths: [10], flag: '🇨🇮' },
  { countryCode: 'SN', name: 'Sénégal', dialCode: '221', nationalLengths: [9], flag: '🇸🇳' },
  { countryCode: 'TG', name: 'Togo', dialCode: '228', nationalLengths: [8], flag: '🇹🇬' },
  { countryCode: 'BF', name: 'Burkina Faso', dialCode: '226', nationalLengths: [8], flag: '🇧🇫' },
  { countryCode: 'ML', name: 'Mali', dialCode: '223', nationalLengths: [8], flag: '🇲🇱' },
  { countryCode: 'NE', name: 'Niger', dialCode: '227', nationalLengths: [8], flag: '🇳🇪' },
  { countryCode: 'GN', name: 'Guinée', dialCode: '224', nationalLengths: [9], flag: '🇬🇳' },
  { countryCode: 'GH', name: 'Ghana', dialCode: '233', nationalLengths: [9], flag: '🇬🇭' },
  { countryCode: 'NG', name: 'Nigeria', dialCode: '234', nationalLengths: [10], flag: '🇳🇬' },
  { countryCode: 'CM', name: 'Cameroun', dialCode: '237', nationalLengths: [9], flag: '🇨🇲' },
];

const BY_COUNTRY = new Map(RULES.map((rule) => [rule.countryCode, rule]));

/** Indicatifs du plus long au plus court, pour reconnaître un E.164 sans ambiguïté. */
const BY_DIAL_CODE = [...RULES].sort((a, b) => b.dialCode.length - a.dialCode.length);

export function getPhoneCountryRule(countryCode: string): PhoneCountryRule | null {
  return BY_COUNTRY.get(countryCode.toUpperCase()) ?? null;
}

export function listPhoneCountryRules(): readonly PhoneCountryRule[] {
  return RULES;
}

/** Retrouve le pays d'un numéro E.164 à son indicatif. */
export function detectPhoneCountry(e164: string): PhoneCountryRule | null {
  const digits = e164.replace(/\D/g, '');
  return BY_DIAL_CODE.find((rule) => digits.startsWith(rule.dialCode)) ?? null;
}

export class InvalidCountryPhoneError extends Error {
  constructor(
    readonly input: string,
    readonly countryCode: string,
    readonly reason: 'EMPTY' | 'NOT_NUMERIC' | 'BAD_LENGTH' | 'UNKNOWN_COUNTRY',
  ) {
    super(`Numéro invalide pour ${countryCode} (${reason}) : ${input}`);
    this.name = 'InvalidCountryPhoneError';
  }
}

/**
 * Normalise un numéro saisi pour un pays donné vers le format E.164.
 *
 * Accepte le numéro national seul, avec ou sans zéro de tronc, précédé de
 * l'indicatif sous ses écritures usuelles (`+221`, `00221`, `221`).
 *
 * @throws InvalidCountryPhoneError si le numéro n'est pas exploitable.
 */
export function normalizePhoneForCountry(input: string, countryCode: string): string {
  const rule = getPhoneCountryRule(countryCode);
  if (!rule) throw new InvalidCountryPhoneError(input, countryCode, 'UNKNOWN_COUNTRY');

  const raw = input.trim();
  if (raw === '') throw new InvalidCountryPhoneError(input, countryCode, 'EMPTY');

  const hadPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits === '') throw new InvalidCountryPhoneError(input, countryCode, 'NOT_NUMERIC');

  const reference = rule.nationalLengths[0] ?? 0;
  let national = digits;

  if (national.startsWith(`00${rule.dialCode}`)) {
    national = national.slice(2 + rule.dialCode.length);
  } else if (national.startsWith(rule.dialCode) && (hadPlus || national.length > reference)) {
    national = national.slice(rule.dialCode.length);
  }

  // Zéro de tronc (`07 …` en Côte d'Ivoire, `077 …` au Sénégal) : retiré
  // quand la longueur dépasse d'un chiffre exactement le plan national.
  if (national.startsWith('0') && !rule.nationalLengths.includes(national.length)) {
    const trimmed = national.slice(1);
    if (rule.nationalLengths.includes(trimmed.length)) national = trimmed;
  }

  if (rule.legacy && national.length === rule.legacy.length) {
    national = `${rule.legacy.prefix}${national}`;
  }

  if (!rule.nationalLengths.includes(national.length)) {
    throw new InvalidCountryPhoneError(input, countryCode, 'BAD_LENGTH');
  }

  return `+${rule.dialCode}${national}`;
}

/** Variante non levante. */
export function tryNormalizePhoneForCountry(input: string, countryCode: string): string | null {
  try {
    return normalizePhoneForCountry(input, countryCode);
  } catch {
    return null;
  }
}

/**
 * Normalise un numéro dont on ne connaît pas le pays à l'avance.
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 * Un numéro qui ANNONCE son indicatif — `+221 77…`, `00225 07…` — est
 * normalisé selon la règle de ce pays. Un numéro sans indicatif est béninois :
 * c'est le pays par défaut, et l'ancien comportement de tous les écrans.
 *
 * C'est ce qui rend l'identifiant de connexion multi-pays sans rien casser :
 * les écrans envoient désormais un E.164 complet, choisi avec un sélecteur de
 * pays, et un numéro national continue d'être lu comme avant.
 *
 * Un indicatif connu mais un numéro invalide pour ce pays est REFUSÉ, jamais
 * retenté avec la règle béninoise : `+221 97 44 12 08` n'est pas un numéro
 * béninois qui aurait le mauvais préfixe, c'est un numéro sénégalais faux.
 */
export function tryNormalizeInternationalPhone(
  input: string,
  fallback: (national: string) => string | null,
): string | null {
  const raw = input.trim();
  const international = /^(\+|00)/.test(raw);

  if (!international) return fallback(raw);

  const digits = raw.replace(/\D/g, '').replace(/^00/, '');
  const rule = BY_DIAL_CODE.find((entry) => digits.startsWith(entry.dialCode));

  if (!rule) return null;

  return tryNormalizePhoneForCountry(`+${digits}`, rule.countryCode);
}

/**
 * Sépare un E.164 en indicatif et chiffres nationaux, pour les prestataires
 * qui attendent les deux à part. Renvoie `null` si l'indicatif est inconnu.
 */
export function splitE164(e164: string): { dialCode: string; national: string } | null {
  const rule = detectPhoneCountry(e164);
  if (!rule) return null;
  const digits = e164.replace(/\D/g, '');
  return { dialCode: rule.dialCode, national: digits.slice(rule.dialCode.length) };
}
