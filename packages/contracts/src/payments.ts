/**
 * Pays, moyens de paiement et prestataires.
 *
 * ── Trois concepts, trois objets ────────────────────────────────────────────
 * Le système de paiement repose sur une séparation stricte :
 *
 *   · Le PAYS       — devise, indicatif, règles. Configurable, activable.
 *   · Le MOYEN      — ce que le participant reconnaît : « MTN MoMo », « Wave »,
 *                     « Carte bancaire ». Un catalogue de marques, pas de code
 *                     métier.
 *   · Le PRESTATAIRE — qui traite réellement l'argent : KPay aujourd'hui,
 *                     un autre demain. Le participant ne le voit jamais.
 *
 * Ce qui relie les trois est une CONFIGURATION, pas du code : « au Bénin, MTN
 * MoMo est collecté ET versé par KPay sous le code `MTN_MOMO_BEN` ». Ouvrir
 * la Côte d'Ivoire consiste à ajouter des lignes de cette configuration, pas
 * à écrire un `if (country === 'CI')`.
 *
 * ── Collecte et versement sont deux capacités distinctes ────────────────────
 * Qu'un moyen sache ENCAISSER ne dit rien de sa capacité à VERSER, et
 * inversement. Un participant paie par carte, l'organisateur reçoit sur MTN :
 * les deux moyens sont indépendants, chacun avec sa propre disponibilité.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.
 */

import { z } from 'zod';
import { CURRENCY_CODES, listPhoneCountryRules, type CurrencyCode } from '@nexakabi/utils';
import { idSchema } from './common.js';
import {
  paymentAvailabilitySchema,
  paymentMethodCodeSchema,
  paymentMethodKindSchema,
  paymentProviderSchema,
  type PaymentMethodCode,
  type PaymentMethodKind,
  type PaymentProviderCode,
} from './enums.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pays
// ─────────────────────────────────────────────────────────────────────────────

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Code pays ISO 3166-1 alpha-2 attendu');

export const currencyCodeSchema = z.enum(CURRENCY_CODES);

/** Pays tel que le public et les organisateurs le voient. */
export const countrySchema = z.object({
  code: countryCodeSchema,
  name: z.string(),
  currency: currencyCodeSchema,
  /** Indicatif international, sans `+`. */
  dialCode: z.string(),
  flag: z.string(),
  isActive: z.boolean(),
  /** Pays proposé par défaut — un seul. Le Bénin, aujourd'hui. */
  isDefault: z.boolean(),
  position: z.number().int(),
});

export type Country = z.infer<typeof countrySchema>;

/** Devise de chaque pays connu — la zone monétaire, pas un choix produit. */
const CURRENCY_BY_COUNTRY: Readonly<Record<string, CurrencyCode>> = {
  BJ: 'XOF',
  CI: 'XOF',
  SN: 'XOF',
  TG: 'XOF',
  BF: 'XOF',
  ML: 'XOF',
  NE: 'XOF',
  GN: 'GNF',
  CM: 'XAF',
  GH: 'GHS',
  NG: 'NGN',
};

/**
 * Pays connus de la plateforme, avant toute activation.
 *
 * Ce tableau amorce la table `Country` et ne la remplace pas : c'est en base
 * que l'administrateur active un pays, en change l'ordre ou le désigne par
 * défaut. Noms, indicatifs et drapeaux viennent du registre des numéros de
 * téléphone (`@nexakabi/utils`) — une seule liste, pas deux à faire diverger.
 */
export const KNOWN_COUNTRIES: readonly Omit<Country, 'isActive' | 'isDefault' | 'position'>[] =
  listPhoneCountryRules()
    .filter((rule) => CURRENCY_BY_COUNTRY[rule.countryCode] !== undefined)
    .map((rule) => ({
      code: rule.countryCode,
      name: rule.name,
      currency: CURRENCY_BY_COUNTRY[rule.countryCode] as CurrencyCode,
      dialCode: rule.dialCode,
      flag: rule.flag,
    }));

export const DEFAULT_COUNTRY_CODE = 'BJ';

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue des moyens de paiement
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentMethodDefinition {
  readonly code: PaymentMethodCode;
  readonly label: string;
  readonly kind: PaymentMethodKind;
  /** Sous-titre de l'écran de choix : « Validation par code USSD ». */
  readonly description: string;
  /** Groupe d'affichage sur l'écran A3. */
  readonly group: 'mobile_money' | 'card' | 'other';
  /**
   * Marque de l'opérateur, telle qu'on la reconnaît d'un coup d'œil.
   *
   * ── Pourquoi la couleur vit ici et pas dans la feuille de style ─────────
   * Sur ce marché, un opérateur se reconnaît à sa couleur AVANT son nom : le
   * jaune MTN, l'orange d'Orange, le bleu de Moov. L'écran de choix est
   * l'endroit exact où un acheteur hésite, et l'hésitation coûte une vente.
   * La couleur appartient donc au moyen, au même titre que son libellé, et
   * accompagne le logo partout où il apparaît — tunnel, console, reçus.
   *
   * `logo` est le nom du fichier dans `/paiements/`, sans extension. Absent
   * pour ce qui n'est pas une marque (virement, simulateur) : l'affichage
   * retombe alors sur une pastille typographique.
   */
  readonly logo?: string;
  /** Couleur de marque, en hexadécimal. Sert de fond à la pastille de repli. */
  readonly brandColor?: string;
  /** Vrai quand la couleur de marque est claire : le texte dessus doit être sombre. */
  readonly brandColorIsLight?: boolean;
}

/**
 * Les moyens que le produit sait présenter.
 *
 * Ce catalogue porte le LIBELLÉ et la NATURE d'un moyen — ce qui relève du
 * produit et ne change pas d'un pays à l'autre. Sa DISPONIBILITÉ, elle, se
 * configure pays par pays en base. Un moyen absent d'ici ne peut pas être
 * configuré : c'est voulu, un écran de paiement ne doit jamais afficher un
 * code brut faute de libellé.
 */
export const PAYMENT_METHOD_DEFINITIONS: readonly PaymentMethodDefinition[] = [
  {
    code: 'mtn_momo',
    label: 'MTN MoMo',
    kind: 'MOBILE_MONEY',
    description: 'Validation par code USSD',
    group: 'mobile_money',
    logo: 'mtn',
    brandColor: '#FFCC00',
    brandColorIsLight: true,
  },
  {
    code: 'moov_money',
    label: 'Moov Money',
    kind: 'MOBILE_MONEY',
    description: 'Validation par code USSD',
    group: 'mobile_money',
    logo: 'moov',
    brandColor: '#F58220',
  },
  {
    code: 'celtiis_cash',
    label: 'Celtiis Cash',
    kind: 'MOBILE_MONEY',
    description: 'Validation par code USSD',
    group: 'mobile_money',
    logo: 'celtiis',
    brandColor: '#00A9A5',
  },
  {
    code: 'orange_money',
    label: 'Orange Money',
    kind: 'MOBILE_MONEY',
    description: 'Validation depuis l’application ou par code USSD',
    group: 'mobile_money',
    logo: 'orange',
    brandColor: '#FF7900',
  },
  {
    code: 'wave',
    label: 'Wave',
    kind: 'MOBILE_MONEY',
    description: 'Validation dans l’application Wave',
    group: 'mobile_money',
    logo: 'wave',
    brandColor: '#1DC8FF',
    brandColorIsLight: true,
  },
  {
    code: 'free_money',
    label: 'Free Money',
    kind: 'MOBILE_MONEY',
    description: 'Validation par code USSD',
    group: 'mobile_money',
    logo: 'free',
    brandColor: '#CD1719',
  },
  {
    code: 't_money',
    label: 'T-Money',
    kind: 'MOBILE_MONEY',
    description: 'Validation par code USSD',
    group: 'mobile_money',
    logo: 't-money',
    brandColor: '#0A5C9E',
  },
  {
    code: 'airtel_money',
    label: 'Airtel Money',
    kind: 'MOBILE_MONEY',
    description: 'Validation par code USSD',
    group: 'mobile_money',
    logo: 'airtel',
    brandColor: '#E40000',
  },
  {
    code: 'card',
    label: 'Carte bancaire',
    kind: 'CARD',
    description: 'Visa · Mastercard · paiement sécurisé',
    group: 'card',
    logo: 'card',
    brandColor: '#1A1F71',
  },
  {
    code: 'bank_transfer',
    label: 'Virement bancaire',
    kind: 'BANK_TRANSFER',
    description: 'Réception sur un compte bancaire',
    group: 'other',
    brandColor: '#4A5568',
  },
];

const DEFINITIONS_BY_CODE = new Map(PAYMENT_METHOD_DEFINITIONS.map((entry) => [entry.code, entry]));

export function getPaymentMethodDefinition(code: string): PaymentMethodDefinition | null {
  return DEFINITIONS_BY_CODE.get(code as PaymentMethodCode) ?? null;
}

/** Un moyen de nature Mobile Money exige le numéro à débiter ou à créditer. */
export function paymentMethodRequiresPhone(kind: PaymentMethodKind): boolean {
  return kind === 'MOBILE_MONEY';
}

// ─────────────────────────────────────────────────────────────────────────────
// Prestataires
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Place d'un prestataire dans le produit.
 *
 * ── Pourquoi « hérité » plutôt que « supprimé » ─────────────────────────────
 * Un prestataire qui a encaissé de l'argent ne disparaît jamais vraiment : des
 * paiements portent son code, il faut pouvoir les relire, les rembourser et
 * les expliquer des mois plus tard. `LEGACY` dit exactement cela — on ne lui
 * confie plus RIEN de neuf, et on sait encore lire ce qu'il a fait.
 *
 * Un seul prestataire est `ACTIVE` au lancement : KPay. Le jour où un autre
 * s'ajoute, il suffit de le déclarer ici — rien d'autre ne bouge.
 */
export type PaymentProviderStatus = 'ACTIVE' | 'LEGACY';

export interface PaymentProviderDefinition {
  readonly code: PaymentProviderCode;
  readonly label: string;
  /**
   * `ACTIVE` : peut recevoir de nouveaux paiements.
   * `LEGACY` : conservé pour l'historique, jamais routé, jamais proposé.
   */
  readonly status: PaymentProviderStatus;
  /**
   * Codes de moyens tels que CE prestataire les nomme, par moyen du catalogue.
   *
   * Vaut pour tous les pays. Un prestataire qui nomme le même moyen
   * différemment d'un pays à l'autre remplit `methodCodesByCountry`.
   */
  readonly methodCodes: Readonly<Partial<Record<PaymentMethodCode, string>>>;
  /**
   * Codes qui DÉPENDENT du pays, indexés par code ISO alpha-2.
   *
   * ── Pourquoi cette seconde table ────────────────────────────────────────
   * Bictorys nomme MTN MoMo `mtn_money` partout ; KPay le nomme
   * `MTN_MOMO_BEN` au Bénin et `MTN_MOMO_CIV` en Côte d'Ivoire — chez lui, le
   * code de moyen porte le pays, et c'est LUI qui en déduit la devise. Un seul
   * code par moyen ne peut donc pas convenir à tous les prestataires.
   *
   * Consultée AVANT `methodCodes` : un pays nommé ici l'emporte. Un moyen
   * absent des deux tables ne peut pas être confié à ce prestataire.
   */
  readonly methodCodesByCountry?: Readonly<
    Record<string, Readonly<Partial<Record<PaymentMethodCode, string>>>>
  >;
}

/**
 * Correspondance entre nos moyens et les identifiants de chaque prestataire.
 *
 * Les codes viennent de la documentation du prestataire, jamais d'une
 * déduction : `mtn_money` chez Bictorys, `moov` sans suffixe. Un moyen absent
 * de la table d'un prestataire ne peut pas lui être confié — le formulaire
 * d'administration le refuse.
 *
 * Celtiis Cash n'a pas d'identifiant documenté chez Bictorys : il n'y figure
 * donc pas, plutôt que d'y être rattaché par supposition. Le jour où le
 * prestataire l'annonce, la synchronisation le remontera dans `unknown` et
 * la ligne s'ajoutera ici, avec le code exact.
 */
export const PAYMENT_PROVIDER_DEFINITIONS: readonly PaymentProviderDefinition[] = [
  {
    /**
     * Bictorys — HÉRITÉ. Plus aucun paiement neuf ne lui est confié.
     *
     * Son implémentation reste en place pour relire, interroger et rembourser
     * ce qu'il a déjà encaissé : supprimer le code rendrait ces paiements
     * illisibles. Le routage l'écarte, la console ne le propose plus.
     */
    code: 'bictorys',
    label: 'Bictorys',
    status: 'LEGACY',
    methodCodes: {
      mtn_momo: 'mtn_money',
      moov_money: 'moov',
      orange_money: 'orange_money',
      wave: 'wave_money',
      free_money: 'free_money',
      t_money: 'togocell',
      card: 'card',
    },
  },
  {
    /**
     * KPay — Mobile Money dans douze pays d'Afrique, derrière une seule API.
     *
     * ── Ce qu'il couvre chez nous, et ce qu'il ne couvre pas ────────────────
     * Son catalogue d'opérateurs (docs KPay, « Opérateurs & pays ») ne retient
     * pour l'Afrique de l'Ouest que le Bénin, la Côte d'Ivoire et le Sénégal —
     * le Togo n'y figure pas, ni Wave dans aucun pays. Les codes ci-dessous
     * sont relevés un par un dans ce catalogue : aucun n'est déduit du motif
     * `OPÉRATEUR_PAYS`, parce qu'il souffre des exceptions (`AIRTEL_OAPI_UGA`).
     *
     * ── Pourquoi la carte n'y est pas ───────────────────────────────────────
     * KPay encaisse bien Visa et Mastercard, mais sa page hébergée facture
     * **en USD** (minimum 1 USD), l'acheteur payant l'équivalent en monnaie
     * locale. Une commande Nexa-Kabi est libellée en entiers XOF : la faire
     * transiter par une conversion dont nous ne maîtrisons ni le taux ni
     * l'arrondi ferait diverger le montant encaissé du montant dû, et le grand
     * livre avec. La carte reste donc à un prestataire qui encaisse en XOF.
     */
    code: 'kpay',
    label: 'KPay',
    status: 'ACTIVE',
    methodCodes: {},
    methodCodesByCountry: {
      BJ: { mtn_momo: 'MTN_MOMO_BEN', moov_money: 'MOOV_BEN' },
      CI: { mtn_momo: 'MTN_MOMO_CIV', orange_money: 'ORANGE_CIV' },
      SN: { orange_money: 'ORANGE_SEN', free_money: 'FREE_SEN' },
      CM: { mtn_momo: 'MTN_MOMO_CMR', orange_money: 'ORANGE_CMR' },
    },
  },
  {
    code: 'mock',
    label: 'Simulateur',
    status: 'ACTIVE',
    methodCodes: {
      mtn_momo: 'mtn_momo',
      moov_money: 'moov_money',
      celtiis_cash: 'celtiis_cash',
      orange_money: 'orange_money',
      wave: 'wave',
      free_money: 'free_money',
      t_money: 't_money',
      airtel_money: 'airtel_money',
      card: 'card',
      bank_transfer: 'bank_transfer',
    },
  },
];

export function getPaymentProviderDefinition(code: string): PaymentProviderDefinition | null {
  return PAYMENT_PROVIDER_DEFINITIONS.find((entry) => entry.code === code) ?? null;
}

/**
 * Ce prestataire peut-il recevoir un NOUVEAU paiement ?
 *
 * Le seul point où la question se pose, pour que « KPay est le seul
 * prestataire du lancement » soit une ligne de configuration et non une
 * condition répétée dans le routage, la console et le tunnel.
 */
export function isPaymentProviderActive(code: string): boolean {
  return getPaymentProviderDefinition(code)?.status === 'ACTIVE';
}

/** Prestataires auxquels on peut confier un moyen aujourd'hui. */
export const ACTIVE_PAYMENT_PROVIDERS = PAYMENT_PROVIDER_DEFINITIONS.filter(
  (entry) => entry.status === 'ACTIVE',
);

/**
 * Le nom que CE prestataire donne à CE moyen dans CE pays.
 *
 * `null` signifie « il ne le traite pas là-bas » — et c'est ce qui doit
 * empêcher la ligne de configuration d'exister, plutôt qu'un paiement
 * d'échouer après la saisie du numéro. Le pays l'emporte sur le code
 * universel : voir `methodCodesByCountry`.
 */
export function resolveProviderMethodCode(
  providerCode: string,
  methodCode: PaymentMethodCode,
  countryCode: string,
): string | null {
  const provider = getPaymentProviderDefinition(providerCode);
  if (!provider) return null;

  const byCountry = provider.methodCodesByCountry?.[countryCode.toUpperCase()]?.[methodCode];

  return byCountry ?? provider.methodCodes[methodCode] ?? null;
}

/**
 * Moyens qu'un prestataire sait traiter.
 *
 * Sans pays, l'union de tous ceux qu'il traite quelque part — ce qui sert à
 * décrire le prestataire. Avec un pays, ceux qu'il traite LÀ, et c'est cette
 * liste que la console doit proposer.
 */
export function listProviderMethodCodes(
  providerCode: string,
  countryCode?: string,
): PaymentMethodCode[] {
  const provider = getPaymentProviderDefinition(providerCode);
  if (!provider) return [];

  if (countryCode) {
    return PAYMENT_METHOD_DEFINITIONS.map((entry) => entry.code).filter(
      (code) => resolveProviderMethodCode(providerCode, code, countryCode) !== null,
    );
  }

  const codes = new Set<PaymentMethodCode>(
    Object.keys(provider.methodCodes) as PaymentMethodCode[],
  );

  for (const byCountry of Object.values(provider.methodCodesByCountry ?? {})) {
    for (const code of Object.keys(byCountry) as PaymentMethodCode[]) codes.add(code);
  }

  return PAYMENT_METHOD_DEFINITIONS.map((entry) => entry.code).filter((code) => codes.has(code));
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration d'un moyen dans un pays (administration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une ligne de configuration : pays × moyen × prestataire.
 *
 * Deux paires de drapeaux, à ne pas confondre :
 *   · `collectionEnabled` / `payoutEnabled` — la DÉCISION de l'administrateur.
 *   · `providerCollectionEnabled` / `providerPayoutEnabled` — le CONSTAT
 *     remonté par le prestataire lors de la dernière synchronisation, `null`
 *     tant qu'aucune n'a eu lieu.
 * Un moyen n'est proposé que si la décision ET le constat l'autorisent : on
 * ne propose jamais ce que le compte marchand ne sait pas faire.
 */
export const countryPaymentMethodSchema = z.object({
  id: idSchema,
  countryCode: countryCodeSchema,
  methodCode: paymentMethodCodeSchema,
  label: z.string(),
  kind: paymentMethodKindSchema,
  providerCode: paymentProviderSchema,
  providerMethodCode: z.string(),
  collectionEnabled: z.boolean(),
  payoutEnabled: z.boolean(),
  providerCollectionEnabled: z.boolean().nullable(),
  providerPayoutEnabled: z.boolean().nullable(),
  providerSyncedAt: z.string().nullable(),
  /**
   * État opérationnel relevé chez le prestataire, encaissement et versement
   * séparés : un opérateur peut encaisser normalement et verser en retard.
   */
  collectionAvailability: paymentAvailabilitySchema,
  payoutAvailability: paymentAvailabilitySchema,
  availabilityCheckedAt: z.string().nullable(),
  /** `LEGACY` : ligne conservée pour l'historique, jamais routée. */
  providerStatus: z.enum(['ACTIVE', 'LEGACY']),
  position: z.number().int(),
  /** Décision × constat × prestataire branché : ce que voit réellement le public. */
  effectiveCollection: z.boolean(),
  effectivePayout: z.boolean(),
});

export type CountryPaymentMethod = z.infer<typeof countryPaymentMethodSchema>;

/** Pays avec sa configuration complète, pour la console. */
export const countryConfigurationSchema = countrySchema.extend({
  methods: z.array(countryPaymentMethodSchema),
  /** Villes actives rattachées, pour signaler un pays sans ville. */
  cityCount: z.number().int(),
});

export type CountryConfiguration = z.infer<typeof countryConfigurationSchema>;

export const updateCountrySchema = z
  .object({
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    position: z.number().int().min(0).max(999).optional(),
  })
  .refine((value) => value.isDefault !== true || value.isActive !== false, {
    message: 'Le pays par défaut doit être actif',
    path: ['isDefault'],
  });

export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;

export const upsertCountryPaymentMethodSchema = z
  .object({
    methodCode: paymentMethodCodeSchema,
    providerCode: paymentProviderSchema,
    collectionEnabled: z.boolean().default(false),
    payoutEnabled: z.boolean().default(false),
    position: z.number().int().min(0).max(999).default(0),
  })
  // Le PAYS ne figure pas dans ce corps — il est dans l'adresse. Ce contrôle
  // ne peut donc dire que « ce prestataire traite ce moyen QUELQUE PART » ;
  // c'est `PaymentRoutingService.upsertMethod` qui tranche pour le pays visé,
  // seul endroit à le connaître.
  .refine((value) => listProviderMethodCodes(value.providerCode).includes(value.methodCode), {
    message: 'Ce prestataire ne prend pas en charge ce moyen de paiement',
    path: ['providerCode'],
  })
  // Un prestataire hérité se lit encore, ne se configure plus : lui confier un
  // moyen neuf ressusciterait une intégration qu'on a justement mise de côté.
  .refine((value) => isPaymentProviderActive(value.providerCode), {
    message: 'Ce prestataire n’est plus actif : il ne reçoit plus de nouveaux paiements',
    path: ['providerCode'],
  });

export type UpsertCountryPaymentMethodInput = z.infer<typeof upsertCountryPaymentMethodSchema>;

/** Résultat d'une synchronisation avec le prestataire. */
export const providerSyncResultSchema = z.object({
  providerCode: paymentProviderSchema,
  syncedAt: z.string(),
  /** Lignes mises à jour. */
  updated: z.number().int(),
  /** Moyens annoncés par le prestataire sans ligne de configuration chez nous. */
  unknown: z.array(
    z.object({
      countryCode: z.string(),
      providerMethodCode: z.string(),
      collection: z.boolean(),
      payout: z.boolean(),
    }),
  ),
});

export type ProviderSyncResult = z.infer<typeof providerSyncResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Ce que voient le tunnel d'achat et l'organisateur
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Moyen de collecte proposé au participant, écran A3.
 *
 * Généré depuis la configuration du pays de la commande. Le prestataire n'y
 * figure pas : le participant choisit « MTN MoMo », jamais « Bictorys ».
 */
export const checkoutPaymentMethodSchema = z.object({
  code: paymentMethodCodeSchema,
  label: z.string(),
  description: z.string(),
  kind: paymentMethodKindSchema,
  group: z.enum(['mobile_money', 'card', 'other']),
  /** Le numéro à débiter est demandé — Mobile Money uniquement. */
  requiresPhone: z.boolean(),
  /** Le paiement se poursuit sur une page du prestataire — carte bancaire. */
  redirects: z.boolean(),
  /** Nom du fichier de logo dans `/paiements/`, sans extension. */
  logo: z.string().nullable(),
  /** Couleur de marque, pour la pastille de repli et les accents. */
  brandColor: z.string().nullable(),
  brandColorIsLight: z.boolean(),
  /**
   * État constaté chez le prestataire.
   *
   * `CLOSED` n'arrive jamais jusqu'ici — un moyen fermé est retiré de la
   * liste. `DELAYED` y arrive, lui : l'opérateur répond, plus lentement que
   * d'habitude. Le dire laisse l'acheteur choisir en connaissance de cause,
   * plutôt que de lui retirer un moyen qui fonctionne ou de le laisser
   * s'inquiéter devant un écran d'attente qui dure.
   */
  availability: paymentAvailabilitySchema,
});

export type CheckoutPaymentMethod = z.infer<typeof checkoutPaymentMethodSchema>;

export const checkoutPaymentMethodsSchema = z.object({
  countryCode: countryCodeSchema,
  currency: currencyCodeSchema,
  dialCode: z.string(),
  methods: z.array(checkoutPaymentMethodSchema),
  notice: z.string(),
});

export type CheckoutPaymentMethods = z.infer<typeof checkoutPaymentMethodsSchema>;

/**
 * Moyen de réception proposé à un organisateur pour ses retraits.
 *
 * `automatic` distingue un versement que le prestataire exécute d'un virement
 * qu'un administrateur fait à la main puis enregistre : les deux existent,
 * l'organisateur doit savoir lequel il choisit.
 */
export const payoutMethodSchema = z.object({
  code: paymentMethodCodeSchema,
  label: z.string(),
  kind: paymentMethodKindSchema,
  requiresPhone: z.boolean(),
  requiresBankDetails: z.boolean(),
  automatic: z.boolean(),
});

export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

export const payoutMethodsSchema = z.object({
  countryCode: countryCodeSchema,
  currency: currencyCodeSchema,
  dialCode: z.string(),
  methods: z.array(payoutMethodSchema),
});

export type PayoutMethods = z.infer<typeof payoutMethodsSchema>;
