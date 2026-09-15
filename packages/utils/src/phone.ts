/**
 * Numéros de téléphone.
 *
 * Le numéro est l'IDENTIFIANT D'AUTHENTIFICATION du produit et la clé de
 * rapprochement Mobile Money. Sa normalisation est donc critique.
 *
 * Le Bénin a migré d'un plan de numérotation à 8 chiffres vers un plan à
 * 10 chiffres (préfixe « 01 » ajouté devant l'ancien numéro). Le prototype de
 * référence affiche encore l'ancien format. Ce module accepte les deux à la
 * saisie et normalise systématiquement vers le format à 10 chiffres.
 *
 * Voir docs/PROJECT_ANALYSIS.md §8, ambiguïté A2.
 * ⚠️ Le plan de numérotation doit être confirmé auprès de l'ARCEP-Bénin.
 */

export const BENIN_COUNTRY_CODE = '229';
export const BENIN_NATIONAL_PREFIX = '01';
/** Longueur du numéro national béninois, préfixe « 01 » compris. */
export const BENIN_NATIONAL_LENGTH = 10;
/** Longueur historique, avant la migration à 10 chiffres. */
export const BENIN_LEGACY_LENGTH = 8;

export type MobileOperator = 'MTN' | 'MOOV' | 'CELTIIS' | 'UNKNOWN';

/**
 * Préfixes opérateurs, appliqués aux deux chiffres suivant le « 01 ».
 * Indicatif uniquement : sert à pré-sélectionner un moyen de paiement, jamais
 * à refuser un numéro. La portabilité rend cette information non contractuelle.
 */
const OPERATOR_PREFIXES: ReadonlyArray<readonly [MobileOperator, readonly string[]]> = [
  [
    'MTN',
    [
      '51',
      '52',
      '53',
      '54',
      '56',
      '57',
      '59',
      '61',
      '62',
      '63',
      '66',
      '67',
      '69',
      '90',
      '91',
      '96',
      '97',
    ],
  ],
  [
    'MOOV',
    [
      '40',
      '42',
      '43',
      '44',
      '46',
      '47',
      '48',
      '49',
      '58',
      '60',
      '64',
      '65',
      '68',
      '94',
      '95',
      '98',
      '99',
    ],
  ],
  ['CELTIIS', ['20', '21', '22', '23', '24', '25', '41', '55']],
];

export class InvalidPhoneNumberError extends Error {
  constructor(
    public readonly input: string,
    public readonly reason: 'EMPTY' | 'BAD_LENGTH' | 'BAD_COUNTRY' | 'NOT_NUMERIC',
  ) {
    super(`Numéro de téléphone invalide (${reason}) : « ${input} »`);
    this.name = 'InvalidPhoneNumberError';
  }
}

/**
 * Normalise un numéro béninois vers le format E.164 (`+2290197441208`).
 *
 * Formats acceptés :
 *   97 44 12 08          (ancien, 8 chiffres → converti)
 *   01 97 44 12 08       (nouveau, 10 chiffres)
 *   +229 01 97 44 12 08
 *   00229 0197441208
 *   229 0197441208
 *
 * @throws InvalidPhoneNumberError si le numéro n'est pas exploitable.
 */
export function normalizePhone(input: string): string {
  const raw = input.trim();
  if (raw === '') {
    throw new InvalidPhoneNumberError(input, 'EMPTY');
  }

  // Ne conserver que les chiffres, en mémorisant la présence d'un « + » initial.
  const hadPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (digits === '') {
    throw new InvalidPhoneNumberError(input, 'NOT_NUMERIC');
  }

  let national = digits;

  // Retirer le préfixe international sous ses différentes écritures.
  if (national.startsWith(`00${BENIN_COUNTRY_CODE}`)) {
    national = national.slice(2 + BENIN_COUNTRY_CODE.length);
  } else if (
    national.startsWith(BENIN_COUNTRY_CODE) &&
    (hadPlus || national.length > BENIN_NATIONAL_LENGTH)
  ) {
    national = national.slice(BENIN_COUNTRY_CODE.length);
  }

  // Conversion de l'ancien plan de numérotation vers le nouveau.
  if (national.length === BENIN_LEGACY_LENGTH) {
    national = `${BENIN_NATIONAL_PREFIX}${national}`;
  }

  if (national.length !== BENIN_NATIONAL_LENGTH) {
    throw new InvalidPhoneNumberError(input, 'BAD_LENGTH');
  }

  if (!national.startsWith(BENIN_NATIONAL_PREFIX)) {
    throw new InvalidPhoneNumberError(input, 'BAD_COUNTRY');
  }

  return `+${BENIN_COUNTRY_CODE}${national}`;
}

/** Variante non levante : renvoie `null` au lieu de lever une exception. */
export function tryNormalizePhone(input: string): string | null {
  try {
    return normalizePhone(input);
  } catch {
    return null;
  }
}

export function isValidPhone(input: string): boolean {
  return tryNormalizePhone(input) !== null;
}

/**
 * Formate un numéro E.164 pour l'affichage.
 *
 * @example formatPhone('+2290197441208') === '+229 01 97 44 12 08'
 * @example formatPhone('+2290197441208', 'national') === '01 97 44 12 08'
 */
export function formatPhone(
  e164: string,
  style: 'international' | 'national' = 'international',
): string {
  const national = toNationalDigits(e164);
  const grouped = national.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return style === 'international' ? `+${BENIN_COUNTRY_CODE} ${grouped}` : grouped;
}

/**
 * Comme `formatPhone`, mais ne lève jamais : un numéro qui ne se formate pas
 * est rendu tel quel.
 *
 * Pour les écrans qui AFFICHENT des données venues de la base — une console
 * d'administration, une liste — où une seule ligne mal formée (numéro
 * provisoire d'un compte d'équipe, donnée d'avant une migration) ne doit pas
 * faire tomber toute la page. La saisie, elle, reste stricte.
 */
export function formatPhoneSafe(
  e164: string,
  style: 'international' | 'national' = 'international',
): string {
  try {
    return formatPhone(e164, style);
  } catch {
    return e164;
  }
}

/**
 * Masque un numéro pour les contextes où il ne doit pas être exposé en entier
 * (carnet du contrôleur, écrans publics).
 *
 * @example maskPhone('+2290197441208') === '+229 01 •• •• 12 08'
 */
export function maskPhone(e164: string): string {
  const national = toNationalDigits(e164);
  const head = national.slice(0, 2);
  const tail = national.slice(-4);
  return `+${BENIN_COUNTRY_CODE} ${head} •• •• ${tail.slice(0, 2)} ${tail.slice(2)}`;
}

/**
 * Détecte l'opérateur mobile d'un numéro. Résultat INDICATIF : la portabilité
 * du numéro rend cette information non fiable. Ne jamais l'utiliser pour
 * refuser un paiement, seulement pour proposer un moyen par défaut.
 */
export function detectOperator(e164: string): MobileOperator {
  const national = toNationalDigits(e164);
  const prefix = national.slice(2, 4);

  for (const [operator, prefixes] of OPERATOR_PREFIXES) {
    if (prefixes.includes(prefix)) return operator;
  }
  return 'UNKNOWN';
}

/**
 * Extrait les 10 chiffres nationaux d'un numéro E.164 béninois.
 *
 * Exporté parce que les opérateurs de paiement attendent le numéro sous cette
 * forme, avec le code pays passé séparément — leur envoyer un E.164 complet
 * fait échouer la demande sans message utile.
 */
export function toNationalDigits(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const national = digits.startsWith(BENIN_COUNTRY_CODE)
    ? digits.slice(BENIN_COUNTRY_CODE.length)
    : digits;

  if (national.length !== BENIN_NATIONAL_LENGTH) {
    throw new InvalidPhoneNumberError(e164, 'BAD_LENGTH');
  }
  return national;
}
