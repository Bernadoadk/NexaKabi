import { z } from 'zod';
import { documentTypeSchema, type DocumentType, type OrganizationType } from './enums.js';

/**
 * Ce qu'on a le DROIT de demander à un organisateur, à qui, et pourquoi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Le cadre béninois, en clair
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Loi n° 2017-20 du 20 avril 2018 portant Code du numérique en République du
 * Bénin, Livre cinquième (protection des données à caractère personnel et de
 * la vie privée), modifiée par la loi n° 2020-35 du 6 janvier 2021. Autorité
 * de contrôle : l'APDP. Quatre règles commandent tout ce fichier.
 *
 * ── 1. Proportionnalité ───────────────────────────────────────────────────
 * On ne collecte que ce qui est nécessaire à une finalité déterminée. Demander
 * une carte d'identité à TOUS les organisateurs « au cas où » est
 * disproportionné et indéfendable : le rapprochement avec le titulaire du
 * compte Mobile Money — dont l'identité a déjà été vérifiée par l'opérateur —
 * suffit dans l'immense majorité des dossiers.
 *
 * C'est pourquoi ce catalogue ne sert JAMAIS au dépôt spontané. Il ne s'ouvre
 * que lorsqu'un modérateur a formulé un doute nommé sur un dossier précis, et
 * seulement pour les pièces qu'il a effectivement demandées. « Celui-ci, parce
 * que », jamais « tout le monde, au cas où ».
 *
 * ── 2. L'image du visage est une donnée biométrique ───────────────────────
 * Le Code du numérique définit les données biométriques comme les données
 * relatives aux caractéristiques physiques, physiologiques ou comportementales
 * permettant l'identification unique d'une personne, « telles que les images
 * faciales ». Contrairement au RGPD, la définition béninoise ne demande pas
 * qu'un traitement technique particulier soit appliqué : la photo elle-même
 * entre dans le champ.
 *
 * Deux conséquences, appliquées sans exception :
 *   — le selfie ne part qu'avec un consentement EXPRÈS, recueilli au moment de
 *     la prise, distinct de l'acceptation des conditions générales ;
 *   — aucun gabarit biométrique n'est calculé, aucune reconnaissance faciale,
 *     aucun rapprochement automatique. Un humain regarde, décide, et la photo
 *     est détruite. Un traitement d'identification automatisée relèverait de
 *     l'autorisation préalable de l'APDP ; on ne s'y engage pas.
 *
 * ── 3. Ne jamais toucher aux données sensibles ────────────────────────────
 * Le Code interdit par principe le traitement des données révélant les
 * opinions ou activités religieuses, philosophiques, politiques, syndicales,
 * la vie sexuelle, l'origine raciale ou ethnique, la santé et la génétique.
 *
 * D'où un choix qui surprend et qui est pourtant le cœur du sujet : les
 * STATUTS d'une association ne sont plus demandables. Ils décrivent l'objet de
 * l'association, donc potentiellement son orientation religieuse ou politique.
 * Le récépissé de déclaration prouve exactement ce qu'on cherche — l'existence
 * légale — sans rien révéler de tout cela. `ASSOCIATION_STATUTES` reste lisible
 * pour les dossiers anciens, mais aucun modérateur ne peut plus le réclamer.
 *
 * Même raison pour ce qui n'apparaîtra jamais ici : casier judiciaire,
 * certificat médical, acte de naissance, relevé bancaire complet.
 *
 * ── 4. Conservation limitée ───────────────────────────────────────────────
 * Une pièce d'identité personnelle est détruite dès que la décision est
 * rendue : elle n'a plus d'objet, et la garder ne fait que créer un risque.
 * Voir `isPersonalDocument()`, appliqué par l'API à l'instant de la décision.
 * Les documents d'entité (RCCM, IFU, récépissé, acte de création) restent :
 * ce sont des pièces d'ENTREPRISE issues de registres publics, pas des données
 * personnelles, et un contrôle comptable peut légitimement les redemander.
 *
 * ── Ce qui reste à faire hors du code ─────────────────────────────────────
 * Déclarer le traitement auprès de l'APDP avant la mise en service réelle, et
 * publier une politique de confidentialité qui reprenne les finalités, les
 * durées et les droits d'accès, de rectification et d'opposition. Aucune ligne
 * de code ne remplace ces deux formalités.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comment la pièce est saisie. Ce n'est pas une préférence d'affichage : c'est
 * ce qui détermine le composant ouvert côté organisateur.
 */
export type DocumentCapture =
  /** Appareil photo frontal, en direct. La galerie est fermée — voir plus bas. */
  | 'selfie'
  /** Pièce d'identité : photo nette ou scan. */
  | 'identity'
  /** Document administratif : photo, scan ou PDF. */
  | 'paper';

/** À qui la pièce se rapporte — la phrase montrée en dépend. */
export type DocumentHolder = 'person' | 'entity';

export interface VerificationDocumentSpec {
  type: DocumentType;
  /** Libellé complet, tel qu'il se dit au Bénin. */
  label: string;
  /** Libellé court, pour une puce ou une ligne de liste. */
  short: string;
  /** Ce qu'on attend exactement, en une phrase adressée à l'organisateur. */
  help: string;
  /** Pourquoi on a le droit de la demander. Montré, jamais caché. */
  purpose: string;
  capture: DocumentCapture;
  holder: DocumentHolder;
  /** Statuts d'organisateur auxquels cette pièce peut être demandée. */
  organizationTypes: readonly OrganizationType[];
  /**
   * Donnée personnelle au sens du Livre cinquième : accès restreint, chaque
   * consultation tracée, destruction à la décision.
   */
  personal: boolean;
  /** Faux pour un type conservé en lecture seule (dossiers anciens). */
  requestable: boolean;
  /** Types MIME acceptés au dépôt. */
  accept: readonly string[];
}

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const PAPER_MIME = [...IMAGE_MIME, 'application/pdf'] as const;

const ALL_TYPES = [
  'INDIVIDUAL',
  'COMPANY',
  'ASSOCIATION',
  'INSTITUTION',
] as const satisfies readonly OrganizationType[];

export const VERIFICATION_DOCUMENTS: Readonly<Record<DocumentType, VerificationDocumentSpec>> = {
  SELFIE: {
    type: 'SELFIE',
    label: 'Photo du visage, prise en direct',
    short: 'Photo en direct',
    help: 'Regarde l’objectif, dans un endroit éclairé, sans lunettes de soleil ni casquette. La photo se prend avec l’appareil, ici, maintenant — impossible d’en choisir une dans la galerie.',
    purpose:
      'Confirmer que la personne qui tient le compte est bien celle de la pièce d’identité. Un humain compare, puis la photo est détruite : aucune reconnaissance faciale, aucun gabarit conservé.',
    capture: 'selfie',
    holder: 'person',
    organizationTypes: ALL_TYPES,
    personal: true,
    requestable: true,
    // Produit par le canevas de capture : toujours du JPEG, jamais autre chose.
    accept: ['image/jpeg'],
  },

  CIP: {
    type: 'CIP',
    label: 'Certificat d’identification personnelle (CIP)',
    short: 'CIP',
    help: 'Le certificat délivré par l’ANIP, en entier, avec la photo et les deux QR codes lisibles.',
    purpose: 'Établir l’identité de la personne responsable du compte.',
    capture: 'identity',
    holder: 'person',
    organizationTypes: ALL_TYPES,
    personal: true,
    requestable: true,
    accept: IMAGE_MIME,
  },

  ID_CARD: {
    type: 'ID_CARD',
    label: 'Carte nationale d’identité biométrique',
    short: 'Carte d’identité',
    help: 'Recto et verso, à plat, sans reflet. Dépose les deux faces l’une après l’autre.',
    purpose: 'Établir l’identité de la personne responsable du compte.',
    capture: 'identity',
    holder: 'person',
    organizationTypes: ALL_TYPES,
    personal: true,
    requestable: true,
    accept: IMAGE_MIME,
  },

  PASSPORT: {
    type: 'PASSPORT',
    label: 'Passeport',
    short: 'Passeport',
    help: 'La page qui porte la photo et les deux lignes de caractères du bas, en entier.',
    purpose:
      'Établir l’identité de la personne responsable du compte, quand elle n’a ni CIP ni carte d’identité béninoise.',
    capture: 'identity',
    holder: 'person',
    organizationTypes: ALL_TYPES,
    personal: true,
    requestable: true,
    accept: IMAGE_MIME,
  },

  RCCM: {
    type: 'RCCM',
    label: 'Registre du commerce (RCCM)',
    short: 'RCCM',
    help: 'L’attestation d’immatriculation, au nom exact de l’organisation déclarée ici.',
    purpose: 'Vérifier que la société existe légalement et porte bien ce nom.',
    capture: 'paper',
    holder: 'entity',
    organizationTypes: ['COMPANY'],
    personal: false,
    requestable: true,
    accept: PAPER_MIME,
  },

  IFU: {
    type: 'IFU',
    label: 'Identifiant fiscal unique (IFU)',
    short: 'IFU',
    help: 'L’attestation d’IFU délivrée par la Direction générale des impôts.',
    purpose:
      'Rattacher les recettes versées à un contribuable identifié — c’est ce qui rend les reversements traçables.',
    capture: 'paper',
    holder: 'entity',
    organizationTypes: ALL_TYPES,
    personal: false,
    requestable: true,
    accept: PAPER_MIME,
  },

  ASSOCIATION_RECEIPT: {
    type: 'ASSOCIATION_RECEIPT',
    label: 'Récépissé de déclaration d’association',
    short: 'Récépissé',
    help: 'Le récépissé délivré par le ministère de l’Intérieur. Les statuts ne sont pas demandés — et ne doivent pas être envoyés.',
    purpose:
      'Prouver l’existence légale de l’association. Le récépissé suffit : les statuts décriraient son objet, donc peut-être une orientation religieuse ou politique, que la loi interdit de traiter.',
    capture: 'paper',
    holder: 'entity',
    organizationTypes: ['ASSOCIATION'],
    personal: false,
    requestable: true,
    accept: PAPER_MIME,
  },

  ASSOCIATION_STATUTES: {
    type: 'ASSOCIATION_STATUTES',
    label: 'Statuts de l’association (ancien dépôt)',
    short: 'Statuts',
    help: 'Type conservé pour les dossiers déposés avant le récépissé. Il n’est plus demandé.',
    purpose:
      'Retiré du catalogue : les statuts révèlent l’objet de l’association, donc éventuellement une donnée sensible au sens du Code du numérique.',
    capture: 'paper',
    holder: 'entity',
    organizationTypes: ['ASSOCIATION'],
    personal: false,
    requestable: false,
    accept: PAPER_MIME,
  },

  INSTITUTION_ACT: {
    type: 'INSTITUTION_ACT',
    label: 'Acte de création de l’institution',
    short: 'Acte de création',
    help: 'Le décret, l’arrêté ou la décision qui crée l’établissement, ou l’attestation d’existence qui en tient lieu.',
    purpose: 'Vérifier que l’établissement existe et que son nom correspond à celui déclaré.',
    capture: 'paper',
    holder: 'entity',
    organizationTypes: ['INSTITUTION'],
    personal: false,
    requestable: true,
    accept: PAPER_MIME,
  },

  OTHER: {
    type: 'OTHER',
    label: 'Autre document de l’organisation',
    short: 'Autre document',
    help: 'Uniquement si le modérateur a précisé lequel dans son message. Jamais une pièce médicale, judiciaire ou bancaire.',
    purpose: 'Répondre à une demande précise, formulée dans le message du modérateur.',
    capture: 'paper',
    holder: 'entity',
    organizationTypes: ALL_TYPES,
    personal: false,
    requestable: true,
    accept: PAPER_MIME,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Lectures du catalogue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les pièces qu'un modérateur peut demander à CE statut d'organisateur.
 *
 * L'ordre est celui de l'écran : la personne d'abord — c'est elle qu'on
 * cherche à identifier — puis l'entité, puis le fourre-tout.
 */
export function requestableDocuments(
  organizationType: OrganizationType,
): readonly VerificationDocumentSpec[] {
  const order: Record<DocumentHolder, number> = { person: 0, entity: 1 };

  return Object.values(VERIFICATION_DOCUMENTS)
    .filter((spec) => spec.requestable && spec.organizationTypes.includes(organizationType))
    .sort((a, b) => {
      if (a.type === 'OTHER') return 1;
      if (b.type === 'OTHER') return -1;
      return order[a.holder] - order[b.holder];
    });
}

export function documentSpec(type: DocumentType): VerificationDocumentSpec {
  return VERIFICATION_DOCUMENTS[type];
}

export function documentLabel(type: DocumentType): string {
  return VERIFICATION_DOCUMENTS[type]?.label ?? type;
}

/**
 * Une pièce qui se rapporte à une PERSONNE — détruite dès la décision rendue.
 * Appliqué par l'API : voir `VerificationsService.purgePersonalDocuments()`.
 */
export function isPersonalDocument(type: DocumentType): boolean {
  return VERIFICATION_DOCUMENTS[type]?.personal ?? false;
}

/** Une pièce peut-elle être demandée à ce statut d'organisateur ? */
export function canRequestDocument(
  type: DocumentType,
  organizationType: OrganizationType,
): boolean {
  const spec = VERIFICATION_DOCUMENTS[type];
  return Boolean(spec?.requestable && spec.organizationTypes.includes(organizationType));
}

/**
 * Ce que le modérateur demande.
 *
 * Au moins une pièce : « il manque quelque chose » sans dire quoi est
 * exactement la formulation qui fait recommencer l'organisateur trois fois.
 */
export const requestedDocumentsSchema = z
  .array(documentTypeSchema)
  .min(1, 'Choisis au moins une pièce à demander.')
  .max(6)
  .refine((types) => new Set(types).size === types.length, 'Cette pièce est déjà dans la liste.');

// ─────────────────────────────────────────────────────────────────────────────
// Consentement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La phrase exacte que l'organisateur coche avant de fournir une pièce
 * personnelle — photo du visage, carte d'identité, CIP ou passeport.
 *
 * ── Pourquoi UN consentement, et pas un par pièce ─────────────────────────
 * Parce qu'il n'y a qu'une décision à prendre : « j'accepte de prouver mon
 * identité de cette façon ». La découper en trois cases identiques ferait
 * cocher machinalement, ce qui est exactement le contraire d'un consentement
 * éclairé. Une case, un texte complet, en haut, avant tout dépôt.
 *
 * ── Pourquoi le texte vit dans les contrats partagés ──────────────────────
 * C'est un engagement juridique : il doit être identique côté écran et côté
 * API, et versionné avec le reste. La version acceptée est enregistrée avec
 * chaque pièce, pour qu'on sache un jour à QUEL texte l'organisateur a dit
 * oui — un consentement dont on ne peut plus retrouver les termes n'en est
 * plus un.
 */
export const IDENTITY_CONSENT = {
  version: 1,
  label:
    'J’accepte de fournir les pièces demandées et qu’un modérateur de Nexa-Kabi les regarde pour vérifier mon identité.',
  detail:
    'La photo du visage est prise en direct, jamais choisie dans la galerie. Ces pièces sont conservées le temps de l’examen du dossier, puis supprimées dès la décision. Aucune reconnaissance faciale n’est utilisée. Tu peux refuser : écris-nous depuis l’aide, un autre moyen de vérification sera étudié.',
} as const;

/** Durée d'affichage promise, reprise dans les écrans et les messages. */
export const VERIFICATION_REVIEW_DELAY = 'sous 2 heures ouvrées';
