/**
 * Contrat du contrôle à l'entrée.
 *
 * ── Le contexte gouverne tout ───────────────────────────────────────────────
 * Un contrôleur travaille debout, à la porte d'un concert, dans la pénombre,
 * avec une file derrière lui et un réseau qui va et vient. Le verdict doit
 * tomber en moins d'une seconde, **sans réseau**, et sans qu'il ait à toucher
 * l'écran quand le billet est valide.
 *
 * Tout ce qui suit — la logique de verdict, le carnet minimisé, l'arbitrage des
 * conflits — découle de cette contrainte-là.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §7.3 et §8.5.
 */

import { z } from 'zod';
import { idSchema } from './common.js';
import type { CheckInVerdict } from './enums.js';

// ─────────────────────────────────────────────────────────────────────────────
// Carnet (manifeste)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entrée du carnet local.
 *
 * **Données minimisées, volontairement.** Le carnet part sur le téléphone
 * personnel d'un contrôleur, souvent un bénévole recruté pour la soirée. Il n'a
 * aucune raison d'y trouver un numéro de téléphone ou une adresse : le nom
 * suffit à vérifier une pièce d'identité, et les quatre derniers caractères de
 * la référence suffisent à la recherche manuelle.
 *
 * ~120 octets par billet, soit 72 Ko pour 600 billets une fois compressé.
 */
export const manifestEntrySchema = z.object({
  /** Identifiant encodé dans le QR. Clé de recherche du carnet. */
  p: z.string(),
  /** Nom du porteur. */
  n: z.string(),
  /** Catégorie de billet. */
  c: z.string(),
  /** Quatre derniers caractères de la référence, pour la recherche manuelle. */
  s: z.string(),
  /** Statut : `v` valide, `u` déjà utilisé, `x` annulé. */
  t: z.enum(['v', 'u', 'x']),
  /** Heure de la première entrée, en secondes Unix. Absent si jamais entré. */
  a: z.number().int().optional(),
  /** Porte de la première entrée. */
  g: z.string().optional(),
});

export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

export const manifestSchema = z.object({
  eventId: idSchema,
  eventTitle: z.string(),
  eventShortCode: z.string(),
  eventStartsAt: z.string(),
  eventEndsAt: z.string(),
  /** Clé publique Ed25519 de l'événement, en base64url. */
  publicKey: z.string(),
  keyId: z.string(),
  /**
   * Instant du serveur au moment de la génération.
   *
   * Le scanner s'en sert pour mesurer l'écart avec sa propre horloge, et
   * corriger les horodatages de scan. Sans cette correction, l'arbitrage des
   * conflits « premier horodatage gagne » comparerait des horloges non
   * comparables — un téléphone mal réglé raflerait tous les arbitrages.
   */
  serverTime: z.string(),
  /** Version du carnet. Sert d'`ETag` pour les téléchargements suivants. */
  version: z.string(),
  entries: z.array(manifestEntrySchema),
  /** Nombre de billets valides, pour l'affichage « 612 billets attendus ». */
  expectedCount: z.number().int(),
  checkedInCount: z.number().int(),
});

export type Manifest = z.infer<typeof manifestSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Verdicts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verdicts affichés au contrôleur.
 *
 * L'énumération vit dans `enums.ts`, avec toutes les autres du produit. Ce
 * module n'ajoute que ce qui relève de la PRÉSENTATION : la couleur, le
 * libellé, la consigne, la vibration.
 */

export type VerdictTone = 'green' | 'amber' | 'red';

export const VERDICT_TONES: Readonly<Record<CheckInVerdict, VerdictTone>> = {
  VALID: 'green',
  VALID_OFF_MANIFEST: 'green',
  ALREADY_USED: 'amber',
  CANCELLED: 'red',
  INVALID: 'red',
  WRONG_EVENT: 'red',
  EXPIRED: 'red',
  UNREADABLE: 'red',
};

/**
 * Libellés lisibles à un mètre.
 *
 * Courts et sans jargon : le contrôleur lit en diagonale, une main occupée.
 */
export const VERDICT_TITLES: Readonly<Record<CheckInVerdict, string>> = {
  VALID: 'Entrée autorisée',
  VALID_OFF_MANIFEST: 'Entrée autorisée',
  ALREADY_USED: 'Billet déjà utilisé',
  CANCELLED: 'Billet annulé',
  INVALID: 'Billet non valide',
  WRONG_EVENT: 'Autre événement',
  EXPIRED: 'Billet expiré',
  UNREADABLE: 'Code illisible',
};

/** Consigne d'action, quand il y en a une. */
export const VERDICT_INSTRUCTIONS: Readonly<Record<CheckInVerdict, string | null>> = {
  VALID: null,
  VALID_OFF_MANIFEST: 'Billet acheté après le chargement du carnet. Il est authentique.',
  ALREADY_USED: 'Vérifie la pièce d’identité avant d’autoriser l’entrée.',
  CANCELLED: 'Ce billet a été annulé ou remboursé. Oriente la personne vers l’organisateur.',
  INVALID: 'Ce code n’a pas été émis par Nexa-Kabi.',
  WRONG_EVENT: 'Ce billet est valable pour un autre événement.',
  EXPIRED: 'La fenêtre de validité de ce billet est passée.',
  UNREADABLE: 'Réessaie, ou passe par la recherche manuelle.',
};

/**
 * Vibration par verdict, en millisecondes.
 *
 * Trois signatures distinctes : le contrôleur apprend à les reconnaître et
 * finit par ne plus regarder l'écran pour un billet valide.
 */
export const VERDICT_VIBRATION: Readonly<Record<VerdictTone, number[]>> = {
  green: [40],
  amber: [40, 80, 40],
  red: [300],
};

/** Retour automatique au scanner après un verdict vert : zéro tap. */
export const VERDICT_AUTO_DISMISS_MS = 1_500;

export interface CheckInDecision {
  readonly verdict: CheckInVerdict;
  readonly tone: VerdictTone;
  readonly title: string;
  readonly instruction: string | null;
  /** Entrée du carnet, quand le billet y figure. */
  readonly entry?: ManifestEntry;
  /** Identifiant public du billet, dès que la charge utile a pu être lue. */
  readonly ticketPublicId?: string;
  /** Première entrée, pour un billet déjà utilisé. */
  readonly firstSeenAt?: Date;
  readonly firstSeenGate?: string;
}

/**
 * Décide du verdict, à partir d'une signature déjà vérifiée et du carnet local.
 *
 * ── Les cinq étapes du prototype ────────────────────────────────────────────
 *   1. Signature valide ?          non → INVALIDE (rouge)
 *   2. Expiration dépassée ?       oui → EXPIRÉ (rouge)
 *   3. Bon événement ?             non → AUTRE ÉVÉNEMENT (rouge)
 *   4. Présent dans le carnet ?    non → AUTORISÉ, marqué « hors carnet »
 *   5. Déjà entré ?                oui → DÉJÀ UTILISÉ (ambre)
 *                                  non → VALIDE (vert)
 *
 * L'étape 4 est celle qui fait tout tenir : un billet acheté APRÈS le
 * téléchargement du carnet a une signature valide mais n'y figure pas. Le
 * refuser serait un faux négatif intolérable — quelqu'un qui vient de payer se
 * verrait refuser l'entrée. La signature suffit à l'autoriser ; le carnet ne
 * sert qu'à l'unicité et au nom affiché.
 *
 * Les trois premières étapes sont portées par `verifyQrToken` dans
 * `@nexakabi/utils` : cette fonction reçoit son verdict et poursuit.
 */
export function decideCheckIn(input: {
  /** Verdict cryptographique, déjà rendu. */
  signature: 'valid' | 'malformed' | 'bad_signature' | 'expired' | 'wrong_event';
  ticketPublicId?: string;
  /** Entrée du carnet local, si le billet y figure. */
  entry?: ManifestEntry;
  /** Scans déjà enregistrés localement pendant cette session, non synchronisés. */
  locallyScanned?: boolean;
}): CheckInDecision {
  const decide = (verdict: CheckInVerdict, extra: Partial<CheckInDecision> = {}) => ({
    verdict,
    tone: VERDICT_TONES[verdict],
    title: VERDICT_TITLES[verdict],
    instruction: VERDICT_INSTRUCTIONS[verdict],
    ticketPublicId: input.ticketPublicId,
    entry: input.entry,
    ...extra,
  });

  // Étapes 1 à 3 : l'authenticité, avant toute autre considération.
  if (input.signature === 'malformed') return decide('UNREADABLE');
  if (input.signature === 'bad_signature') return decide('INVALID');
  if (input.signature === 'wrong_event') return decide('WRONG_EVENT');
  if (input.signature === 'expired') return decide('EXPIRED');

  // Étape 4 : absent du carnet mais authentique — vendu depuis le chargement.
  if (!input.entry) return decide('VALID_OFF_MANIFEST');

  if (input.entry.t === 'x') return decide('CANCELLED');

  // Étape 5 : unicité. Le scan local compte autant que celui du carnet — deux
  // scans successifs sur le MÊME appareil ne doivent pas passer deux fois.
  if (input.entry.t === 'u' || input.locallyScanned) {
    return decide('ALREADY_USED', {
      firstSeenAt: input.entry.a === undefined ? undefined : new Date(input.entry.a * 1000),
      firstSeenGate: input.entry.g,
    });
  }

  return decide('VALID');
}

/** Vrai si le verdict autorise l'entrée et doit donc être enregistré. */
export function admitsEntry(verdict: CheckInVerdict): boolean {
  return verdict === 'VALID' || verdict === 'VALID_OFF_MANIFEST';
}

// ─────────────────────────────────────────────────────────────────────────────
// Équipe de contrôle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un membre de l'équipe pouvant contrôler l'entrée d'un événement, et ce qu'il
 * y a fait.
 *
 * ── À quoi sert cette fiche ─────────────────────────────────────────────────
 * Un bénévole recruté pour la soirée est payé ensuite par l'organisation, à la
 * tâche ou à l'heure. Il lui faut donc, une fois l'accès du bénévole fermé,
 * de quoi le retrouver et de quoi mesurer ce qu'il a fait : nom, numéro,
 * porte, nombre de scans, première et dernière activité. Le numéro est
 * complet — c'est celui qu'on appelle pour payer — et cette liste n'est
 * visible que des rôles qui gèrent l'équipe, jamais des contrôleurs entre eux.
 */
export const eventStaffMemberSchema = z.object({
  userId: idSchema,
  fullName: z.string(),
  phone: z.string(),
  role: z.string(),
  gate: z.string().nullable(),
  /** Fin de l'accès au scanner. Null pour un rôle permanent. */
  accessEndsAt: z.string().nullable(),
  /** Entrées effectives enregistrées par cette personne. */
  scanCount: z.number().int(),
  firstScanAt: z.string().nullable(),
  lastScanAt: z.string().nullable(),
});

export type EventStaffMember = z.infer<typeof eventStaffMemberSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Synchronisation
// ─────────────────────────────────────────────────────────────────────────────

/** Taille d'un lot d'envoi. Assez grand pour être efficace, assez petit pour
 *  qu'un échec réseau ne fasse pas tout recommencer. */
export const SCAN_BATCH_SIZE = 50;

export const scanRecordSchema = z.object({
  /** Identifiant unique du scan, tiré par l'appareil. Porte l'idempotence. */
  nonce: z.string().min(8).max(64),
  ticketPublicId: z.string(),
  /**
   * Jeton QR intégral, tel que la caméra l'a lu : `NK1.<charge>.<signature>`.
   *
   * ── Pourquoi il remonte au serveur ────────────────────────────────────────
   * Le scanner vérifie déjà la signature hors ligne — c'est ce qui rend le
   * verdict instantané sans réseau. Mais cette vérification tourne sur le
   * téléphone d'un bénévole : elle rend le scanner utilisable, elle ne peut pas
   * faire autorité. Sans le jeton, le serveur accorderait une entrée sur la
   * seule foi d'un `ticketPublicId`, c'est-à-dire d'une chaîne que n'importe
   * quel client peut inventer ou recopier depuis un carnet.
   *
   * Le serveur revérifie donc la signature, l'événement et l'expiration avant
   * d'écrire quoi que ce soit. Les deux vérifications ne font pas double
   * emploi : l'une sert la vitesse, l'autre l'autorité.
   *
   * 127 caractères en pratique ; la borne laisse la place à une version future
   * du format.
   *
   * ── Absent uniquement pour une entrée manuelle ──────────────────────────
   * L'écran de recherche manuelle (C6) existe parce qu'à un moment de la
   * soirée, la caméra ne suffira pas : QR déchiré, écran fissuré, téléphone à
   * plat. Il n'y a alors aucun jeton à présenter. Ce cas doit rester possible,
   * mais il doit se DÉCLARER — d'où `manualEntry`, sans quoi omettre le jeton
   * suffirait à contourner la vérification.
   */
  qrToken: z.string().min(16).max(512).optional(),

  /**
   * Entrée accordée sans lecture du QR, depuis la recherche manuelle.
   *
   * ── Ce que ce drapeau coûte et ce qu'il rapporte ────────────────────────
   * Il rouvre, par construction, la possibilité de marquer un billet utilisé
   * sans en détenir le code. Le périmètre en est étroit : il faut être membre
   * actif de l'organisation propriétaire de l'événement et détenir
   * `checkin:scan` sur cet événement précis — le garde le vérifie, et un tiers
   * ne peut plus viser l'événement d'autrui.
   *
   * Ce qui reste est un risque interne, et il se traite comme tel : chaque
   * entrée manuelle est consignée au journal d'audit avec son auteur. Le
   * prototype exige ce secours ; le supprimer laisserait des porteurs
   * légitimes à la porte, ce qui est un échec produit plus certain que
   * l'abus qu'on éviterait.
   */
  manualEntry: z.boolean().default(false),
  /** Horodatage de l'appareil, DÉJÀ corrigé de l'écart d'horloge. */
  scannedAt: z.iso.datetime({ offset: true, local: true }),
  gate: z.string().max(60).optional(),
  deviceId: z.string().max(64).optional(),
  wasOffline: z.boolean().default(false),
  /** Le contrôleur a forcé l'entrée d'un billet déjà utilisé. */
  overridden: z.boolean().default(false),
});

export type ScanRecord = z.infer<typeof scanRecordSchema>;

export const syncScansSchema = z.object({
  scans: z.array(scanRecordSchema).min(1).max(SCAN_BATCH_SIZE),
});

export type SyncScansInput = z.infer<typeof syncScansSchema>;

export const SCAN_OUTCOMES = [
  /** Enregistré, entrée effective. */
  'accepted',
  /** Déjà connu du serveur — même `nonce`. Rejeu bénin. */
  'duplicate',
  /** Un autre scan a gagné l'arbitrage : conflit consigné. */
  'conflict',
  /** Billet introuvable ou annulé côté serveur. */
  'rejected',
] as const;

export const scanOutcomeSchema = z.enum(SCAN_OUTCOMES);
export type ScanOutcome = z.infer<typeof scanOutcomeSchema>;

export const scanResultSchema = z.object({
  nonce: z.string(),
  outcome: scanOutcomeSchema,
  /** Motif, en français, quand l'issue n'est pas l'acceptation. */
  reason: z.string().nullable(),
});

export const syncScansResultSchema = z.object({
  results: z.array(scanResultSchema),
  accepted: z.number().int(),
  duplicates: z.number().int(),
  conflicts: z.number().int(),
  rejected: z.number().int(),
  /** Nouvelle version du carnet, si des entrées ont changé. */
  manifestVersion: z.string(),
  checkedInCount: z.number().int(),
});

export type SyncScansResult = z.infer<typeof syncScansResultSchema>;

/**
 * Événement assigné à un contrôleur (écran C1).
 *
 * Ne contient que ce qui aide à choisir : quand, où, combien de billets, quelle
 * porte. Rien sur les finances ni sur les participants — le rôle CONTRÔLEUR
 * n'y a pas accès, et cet écran ne doit pas être une fuite par la bande.
 */
export const assignedEventSchema = z.object({
  eventId: idSchema,
  organizationId: idSchema,
  organizationName: z.string(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  doorsOpenAt: z.string().nullable(),
  venueName: z.string().nullable(),
  cityName: z.string().nullable(),
  /** Porte assignée à ce contrôleur, si l'organisateur en a défini une. */
  gate: z.string().nullable(),
  expectedCount: z.number().int(),
  checkedInCount: z.number().int(),
  /** Le scanner est-il ouvert ? Il s'ouvre une heure avant le début. */
  isOpen: z.boolean(),
});

export type AssignedEvent = z.infer<typeof assignedEventSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Vue organisateur
// ─────────────────────────────────────────────────────────────────────────────

export const checkInEntrySchema = z.object({
  id: idSchema,
  ticketReference: z.string(),
  attendeeName: z.string(),
  ticketTypeName: z.string(),
  scannedAt: z.string(),
  recordedAt: z.string(),
  gate: z.string().nullable(),
  scannedByName: z.string(),
  wasOffline: z.boolean(),
  isEffective: z.boolean(),
  revokedAt: z.string().nullable(),
});

export type CheckInEntry = z.infer<typeof checkInEntrySchema>;

export const checkInConflictSchema = z.object({
  id: idSchema,
  ticketReference: z.string(),
  attendeeName: z.string(),
  detectedAt: z.string(),
  resolvedAt: z.string().nullable(),
  winning: z.object({
    scannedAt: z.string(),
    gate: z.string().nullable(),
    scannedByName: z.string(),
  }),
  losing: z.object({
    scannedAt: z.string(),
    gate: z.string().nullable(),
    scannedByName: z.string(),
  }),
});

export type CheckInConflictView = z.infer<typeof checkInConflictSchema>;

export const checkInStatsSchema = z.object({
  expectedCount: z.number().int(),
  checkedInCount: z.number().int(),
  offlineScans: z.number().int(),
  unresolvedConflicts: z.number().int(),
  /** Dernière entrée enregistrée, pour montrer que le flux est vivant. */
  lastCheckInAt: z.string().nullable(),
});

export type CheckInStats = z.infer<typeof checkInStatsSchema>;

/**
 * Le scanner s'ouvre une heure avant le début.
 *
 * Assez tôt pour l'installation et les premiers arrivants, assez tard pour
 * qu'un carnet chargé la veille ne soit pas déjà périmé.
 */
export const SCANNER_OPENS_HOURS_BEFORE = 1;

export function isScannerOpen(
  event: { startsAt: string | Date; endsAt: string | Date },
  now: Date = new Date(),
): boolean {
  const starts = new Date(event.startsAt).getTime();
  const ends = new Date(event.endsAt).getTime();

  return now.getTime() >= starts - SCANNER_OPENS_HOURS_BEFORE * 3_600_000 && now.getTime() <= ends;
}

/**
 * Recherche manuelle dans le carnet.
 *
 * Trois clés, parce qu'un contrôleur cherche avec ce qu'on lui donne : un nom
 * mal orthographié, un numéro dicté, ou les quatre derniers caractères d'une
 * référence lue sur un écran fissuré.
 */
export function searchManifest(
  entries: readonly ManifestEntry[],
  query: string,
  limit = 20,
): ManifestEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const suffix = needle.replace(/[^a-z0-9]/g, '');

  return entries
    .filter(
      (entry) =>
        entry.n.toLowerCase().includes(needle) ||
        (suffix.length >= 2 && entry.s.toLowerCase().includes(suffix)),
    )
    .slice(0, limit);
}
