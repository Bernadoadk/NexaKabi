/**
 * Montants monétaires.
 *
 * Règle absolue du projet : un montant est TOUJOURS un entier, dans la plus
 * petite unité de la devise. Le franc CFA (XOF, XAF) n'a pas de sous-unité :
 * 5 000 FCFA se stocke `5000`. Une devise à deux décimales (GHS, NGN) se
 * stocke en centimes : 12,50 GHS se stocke `1250`. Aucun nombre à virgule
 * flottante ne doit jamais représenter de l'argent.
 *
 * ── Pourquoi un registre et pas une constante ─────────────────────────────
 * Le Bénin est le premier pays, pas le seul. Chaque pays d'Afrique de l'Ouest
 * porte sa devise, et c'est la devise du PAYS DE L'ÉVÉNEMENT qui gouverne une
 * commande, un billet, une écriture au grand livre et un retrait. Ajouter un
 * pays ne doit jamais demander de toucher à ce fichier autrement qu'en
 * ajoutant une ligne au registre — et la plupart des pays cibles partagent
 * déjà le XOF.
 *
 * Voir docs/DATABASE_PROPOSAL.md §1.
 */

/** Espace insécable U+00A0, séparateur de milliers imposé par la direction artistique. */
export const NBSP = ' ';

/** Devises prises en charge — ISO 4217. */
export const CURRENCY_CODES = ['XOF', 'XAF', 'GNF', 'NGN', 'GHS'] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface CurrencyDefinition {
  readonly code: CurrencyCode;
  /** Nombre de décimales de la devise. XOF : 0, GHS : 2. */
  readonly decimals: number;
  /** Suffixe affiché à l'utilisateur. */
  readonly symbol: string;
  /** Nom complet, pour les écrans d'administration. */
  readonly name: string;
}

const CURRENCIES: Record<CurrencyCode, CurrencyDefinition> = {
  XOF: { code: 'XOF', decimals: 0, symbol: 'FCFA', name: 'Franc CFA (UEMOA)' },
  XAF: { code: 'XAF', decimals: 0, symbol: 'FCFA', name: 'Franc CFA (CEMAC)' },
  GNF: { code: 'GNF', decimals: 0, symbol: 'GNF', name: 'Franc guinéen' },
  NGN: { code: 'NGN', decimals: 2, symbol: '₦', name: 'Naira nigérian' },
  GHS: { code: 'GHS', decimals: 2, symbol: 'GH₵', name: 'Cedi ghanéen' },
};

export const DEFAULT_CURRENCY: CurrencyCode = 'XOF';

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

export function getCurrency(code: string = DEFAULT_CURRENCY): CurrencyDefinition {
  const currency = isCurrencyCode(code) ? CURRENCIES[code] : undefined;
  if (!currency) {
    throw new Error(`Devise non prise en charge : ${code}`);
  }
  return currency;
}

/**
 * Devise à utiliser pour un code venu de la base ou d'une API.
 *
 * Une commande porte toujours sa devise ; un code inconnu — donnée d'avant
 * une migration, prestataire qui renvoie autre chose — ne doit pas faire
 * tomber un écran. Il retombe sur la devise par défaut, ce qui reste visible
 * puisque le code affiché ne correspond alors pas au montant attendu.
 */
export function resolveCurrency(code: string | null | undefined): CurrencyDefinition {
  return code && isCurrencyCode(code) ? CURRENCIES[code] : CURRENCIES[DEFAULT_CURRENCY];
}

export function listCurrencies(): readonly CurrencyDefinition[] {
  return CURRENCY_CODES.map((code) => CURRENCIES[code]);
}

/**
 * Formate la partie numérique d'un montant, sans suffixe de devise.
 *
 * @example formatAmount(15000) === '15 000'   (espace insécable)
 * @example formatAmount(-212125) === '−212 125'  (moins typographique U+2212)
 */
export function formatAmount(amount: number, currency: string = DEFAULT_CURRENCY): string {
  assertValidAmount(amount);

  const { decimals } = getCurrency(currency);
  const isNegative = amount < 0;
  const absolute = Math.abs(amount);

  const whole = decimals === 0 ? absolute : Math.trunc(absolute / 10 ** decimals);
  const fraction = decimals === 0 ? '' : String(absolute % 10 ** decimals).padStart(decimals, '0');

  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const body = decimals === 0 ? grouped : `${grouped},${fraction}`;

  // U+2212 (signe moins) plutôt que le trait d'union : c'est le glyphe correct
  // et il s'aligne avec les chiffres tabulaires.
  return isNegative ? `−${body}` : body;
}

/**
 * Formate un montant complet, suffixe de devise inclus.
 *
 * @example formatMoney(15000) === '15 000 FCFA'
 */
export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  return `${formatAmount(amount, currency)}${NBSP}${getCurrency(currency).symbol}`;
}

/**
 * Analyse une saisie utilisateur (« 15 000 », « 15000 », « 15 000 FCFA ») en entier.
 * Renvoie `null` si la saisie n'est pas un montant valide.
 */
export function parseAmount(input: string, currency: string = DEFAULT_CURRENCY): number | null {
  const { decimals } = getCurrency(currency);

  // `\s` couvre en JavaScript les espaces Unicode, dont U+00A0 et U+202F.
  const cleaned = input
    .replace(/\s/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/FCFA|XOF|XAF|GNF|NGN|GHS|GH₵|₦/gi, '')
    .replace(',', '.')
    .trim();

  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  const scaled = Math.round(value * 10 ** decimals);
  return Number.isSafeInteger(scaled) ? scaled : null;
}

/**
 * Applique un pourcentage exprimé en points de base (1 % = 100 bps).
 * L'arrondi est au plus proche : c'est le comportement attendu pour une commission.
 *
 * @example applyBasisPoints(10000, 500) === 500   // 5 % de 10 000
 */
export function applyBasisPoints(amount: number, basisPoints: number): number {
  assertValidAmount(amount);
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error(`Points de base invalides : ${basisPoints}`);
  }
  return Math.round((amount * basisPoints) / 10_000);
}

/** Borne un montant entre un minimum et un maximum optionnels. */
export function clampAmount(amount: number, min?: number, max?: number): number {
  let result = amount;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
}

/** Somme d'une liste de montants, en garantissant l'intégrité entière. */
export function sumAmounts(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    assertValidAmount(amount);
    return total + amount;
  }, 0);
}

/** Vrai si le montant correspond à la gratuité. */
export function isFree(amount: number): boolean {
  return amount === 0;
}

function assertValidAmount(amount: number): void {
  if (!Number.isInteger(amount)) {
    throw new Error(
      `Un montant doit être un entier (unité entière de la devise). Reçu : ${amount}. ` +
        `Voir docs/DATABASE_PROPOSAL.md §1.`,
    );
  }
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Montant hors des entiers sûrs : ${amount}`);
  }
}
