/**
 * Jeton QR d'un billet.
 *
 * ── Ce que le QR doit résoudre ──────────────────────────────────────────────
 * Le contrôleur travaille à la porte d'un concert : réseau incertain, pénombre,
 * téléphone d'entrée de gamme, file d'attente. Le verdict doit tomber en moins
 * d'une seconde et **sans réseau**. Un jeton aléatoire vérifié en base ne
 * conviendrait donc pas.
 *
 * ── Format ──────────────────────────────────────────────────────────────────
 *   NK1.<charge_utile_b64url>.<signature_ed25519_b64url>
 *
 * La charge utile est un tampon binaire compact de 27 octets :
 *
 *   octet  0      version du format (1)
 *   octets 1-16   identifiant public du billet, 16 octets aléatoires
 *   octets 17-22  code court de l'événement, 6 caractères ASCII
 *   octets 23-26  expiration, en HEURES Unix (entier 32 bits, gros-boutiste)
 *
 * → 36 caractères base64url pour la charge utile, 86 pour la signature,
 *   soit **127 caractères** en tout. Le QR tient en version 6, correction M,
 *   et reste lisible à 176 px sur un écran à 40 % de luminosité — la cible du
 *   prototype.
 *
 * L'expiration est comptée en heures et non en secondes : quatre octets
 * suffisent alors jusqu'en l'an 491 936, alors qu'un horodatage en secondes
 * aurait débordé en 2106 ou coûté quatre octets de plus.
 *
 * ── Ce que la signature garantit, et ce qu'elle ne garantit pas ─────────────
 * Elle prouve que le billet a bien été émis par Nexa-Kabi, sans réseau et sans
 * secret partagé : le contrôleur ne détient que la clé PUBLIQUE de l'événement,
 * avec laquelle on ne peut rien forger.
 *
 * Elle ne garantit PAS l'unicité : une capture d'écran d'un QR valide reste
 * valide. C'est inhérent à un QR statique, et c'est assumé — l'unicité est
 * portée par le carnet de check-in et par la contrainte en base. Voir
 * docs/TECHNICAL_ARCHITECTURE.md §7.5.
 */

export const QR_TOKEN_PREFIX = 'NK1';
export const QR_PAYLOAD_VERSION = 1;

/** Longueurs, en octets, des champs de la charge utile. */
export const QR_PUBLIC_ID_BYTES = 16;
export const QR_EVENT_CODE_LENGTH = 6;
export const QR_PAYLOAD_BYTES = 1 + QR_PUBLIC_ID_BYTES + QR_EVENT_CODE_LENGTH + 4;
export const QR_SIGNATURE_BYTES = 64;

/** Délai de grâce après l'événement, pendant lequel le billet reste vérifiable. */
export const QR_GRACE_HOURS = 24;

export interface QrPayload {
  readonly version: number;
  /** Identifiant public du billet, en base64url (22 caractères). */
  readonly ticketPublicId: string;
  readonly eventShortCode: string;
  /** Instant au-delà duquel le billet n'est plus vérifiable. */
  readonly expiresAt: Date;
}

export class QrFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrFormatError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Base64url — isomorphe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encodage sans `Buffer` ni dépendance.
 *
 * Ce module tourne des deux côtés : le serveur signe, la PWA du contrôleur
 * vérifie. Une implémentation qui n'existerait que côté Node obligerait à
 * dupliquer le format — et deux implémentations d'un format finissent toujours
 * par diverger.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Le paramètre `<ArrayBuffer>` n'est pas décoratif : sans lui, TypeScript infère
 * `ArrayBufferLike`, que WebCrypto refuse — il n'accepte pas un tampon
 * potentiellement partagé. L'annoter ici évite une copie défensive chez chaque
 * appelant.
 */
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Charge utile
// ─────────────────────────────────────────────────────────────────────────────

/** Convertit un instant en heures Unix, arrondies vers le haut. */
export function toUnixHours(date: Date): number {
  return Math.ceil(date.getTime() / 3_600_000);
}

export function fromUnixHours(hours: number): Date {
  return new Date(hours * 3_600_000);
}

/** Expiration d'un billet : fin de l'événement, plus le délai de grâce. */
export function qrExpiryFor(eventEndsAt: Date, graceHours = QR_GRACE_HOURS): Date {
  return new Date(eventEndsAt.getTime() + graceHours * 3_600_000);
}

export function packQrPayload(payload: Omit<QrPayload, 'version'>): Uint8Array<ArrayBuffer> {
  const publicId = fromBase64Url(payload.ticketPublicId);

  if (publicId.length !== QR_PUBLIC_ID_BYTES) {
    throw new QrFormatError(
      `L'identifiant public doit faire ${QR_PUBLIC_ID_BYTES} octets (reçu ${publicId.length}).`,
    );
  }

  if (payload.eventShortCode.length !== QR_EVENT_CODE_LENGTH) {
    throw new QrFormatError(
      `Le code d'événement doit faire ${QR_EVENT_CODE_LENGTH} caractères (reçu « ${payload.eventShortCode} »).`,
    );
  }

  const bytes = new Uint8Array(QR_PAYLOAD_BYTES);
  bytes[0] = QR_PAYLOAD_VERSION;
  bytes.set(publicId, 1);

  for (let i = 0; i < QR_EVENT_CODE_LENGTH; i += 1) {
    const code = payload.eventShortCode.charCodeAt(i);

    if (code > 0x7f) {
      throw new QrFormatError("Le code d'événement doit être en ASCII.");
    }

    bytes[1 + QR_PUBLIC_ID_BYTES + i] = code;
  }

  new DataView(bytes.buffer).setUint32(
    1 + QR_PUBLIC_ID_BYTES + QR_EVENT_CODE_LENGTH,
    toUnixHours(payload.expiresAt),
    false,
  );

  return bytes;
}

export function unpackQrPayload(bytes: Uint8Array): QrPayload {
  if (bytes.length !== QR_PAYLOAD_BYTES) {
    throw new QrFormatError(
      `Charge utile de ${bytes.length} octets, ${QR_PAYLOAD_BYTES} attendus.`,
    );
  }

  const version = bytes[0] ?? 0;

  if (version !== QR_PAYLOAD_VERSION) {
    // Un billet d'une version future doit produire un refus clair, pas une
    // lecture approximative : le contrôleur saura qu'il faut mettre à jour.
    throw new QrFormatError(`Version de billet non reconnue : ${version}.`);
  }

  let eventShortCode = '';
  for (let i = 0; i < QR_EVENT_CODE_LENGTH; i += 1) {
    eventShortCode += String.fromCharCode(bytes[1 + QR_PUBLIC_ID_BYTES + i] ?? 0);
  }

  const hours = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    1 + QR_PUBLIC_ID_BYTES + QR_EVENT_CODE_LENGTH,
    false,
  );

  return {
    version,
    ticketPublicId: toBase64Url(bytes.slice(1, 1 + QR_PUBLIC_ID_BYTES)),
    eventShortCode,
    expiresAt: fromUnixHours(hours),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Jeton complet
// ─────────────────────────────────────────────────────────────────────────────

export function buildQrToken(payload: Uint8Array, signature: Uint8Array): string {
  return `${QR_TOKEN_PREFIX}.${toBase64Url(payload)}.${toBase64Url(signature)}`;
}

export interface ParsedQrToken {
  readonly payloadBytes: Uint8Array<ArrayBuffer>;
  readonly signatureBytes: Uint8Array<ArrayBuffer>;
  readonly payload: QrPayload;
}

/**
 * Décompose un jeton scanné.
 *
 * Toute anomalie lève : un contrôleur préfère un refus net à un verdict tiré
 * d'une lecture partielle.
 */
export function parseQrToken(token: string): ParsedQrToken {
  const parts = token.trim().split('.');

  if (parts.length !== 3 || parts[0] !== QR_TOKEN_PREFIX) {
    throw new QrFormatError("Ce code n'est pas un billet Nexa-Kabi.");
  }

  const payloadBytes = fromBase64Url(parts[1] ?? '');
  const signatureBytes = fromBase64Url(parts[2] ?? '');

  if (signatureBytes.length !== QR_SIGNATURE_BYTES) {
    throw new QrFormatError('Signature de taille invalide.');
  }

  return { payloadBytes, signatureBytes, payload: unpackQrPayload(payloadBytes) };
}

/** Vrai si le jeton a la forme d'un billet Nexa-Kabi, sans vérifier la signature. */
export function looksLikeQrToken(value: string): boolean {
  return value.trim().startsWith(`${QR_TOKEN_PREFIX}.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vérification
// ─────────────────────────────────────────────────────────────────────────────

export type QrVerdict = 'valid' | 'malformed' | 'bad_signature' | 'expired' | 'wrong_event';

export interface QrVerification {
  readonly verdict: QrVerdict;
  readonly payload?: QrPayload;
  /** Message destiné au contrôleur, en français, lisible à un mètre. */
  readonly message: string;
}

export interface VerifyQrOptions {
  /** Clé publique Ed25519 de l'événement, 32 octets bruts. */
  readonly publicKey: Uint8Array<ArrayBuffer>;
  /** Code court attendu. Un billet d'un autre événement doit être refusé. */
  readonly eventShortCode?: string;
  readonly now?: Date;
}

/**
 * Vérifie un jeton scanné.
 *
 * Utilise WebCrypto, disponible côté serveur comme côté navigateur : une seule
 * implémentation de la vérification, donc un seul comportement.
 *
 * ⚠️ Ed25519 n'est arrivé dans WebCrypto qu'avec les navigateurs récents. La
 * PWA du contrôleur (phase 8) devra détecter son absence et basculer sur une
 * implémentation logicielle — un téléphone Android d'entrée de gamme un peu
 * ancien est précisément la cible de ce produit.
 */
export async function verifyQrToken(
  token: string,
  options: VerifyQrOptions,
): Promise<QrVerification> {
  let parsed: ParsedQrToken;

  try {
    parsed = parseQrToken(token);
  } catch (error) {
    return {
      verdict: 'malformed',
      message: error instanceof QrFormatError ? error.message : 'Billet illisible.',
    };
  }

  const key = await crypto.subtle.importKey('raw', options.publicKey, { name: 'Ed25519' }, false, [
    'verify',
  ]);

  const signatureValid = await crypto.subtle.verify(
    'Ed25519',
    key,
    parsed.signatureBytes,
    parsed.payloadBytes,
  );

  if (!signatureValid) {
    return {
      verdict: 'bad_signature',
      payload: parsed.payload,
      message: "Ce billet n'a pas été émis par Nexa-Kabi.",
    };
  }

  // L'événement est contrôlé AVANT l'expiration : « billet d'un autre
  // événement » est une information plus utile au contrôleur qu'« expiré »,
  // et les deux peuvent être vraies en même temps.
  if (options.eventShortCode && parsed.payload.eventShortCode !== options.eventShortCode) {
    return {
      verdict: 'wrong_event',
      payload: parsed.payload,
      message: 'Ce billet est valable pour un autre événement.',
    };
  }

  const now = options.now ?? new Date();

  if (parsed.payload.expiresAt.getTime() < now.getTime()) {
    return { verdict: 'expired', payload: parsed.payload, message: 'Ce billet a expiré.' };
  }

  return { verdict: 'valid', payload: parsed.payload, message: 'Billet valide.' };
}
