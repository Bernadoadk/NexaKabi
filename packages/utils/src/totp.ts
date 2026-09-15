import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Mots de passe à usage unique fondés sur le temps (RFC 6238).
 *
 * ── Pourquoi c'est écrit ici plutôt qu'installé ────────────────────────────
 * L'algorithme tient en trente lignes et la RFC publie ses vecteurs de test :
 * `totp.test.ts` les rejoue tous. Une implémentation qu'on peut vérifier
 * intégralement contre la norme n'a pas besoin d'être empruntée.
 *
 * Le calcul est de toute façon la partie facile. Ce qui compte — la fenêtre de
 * tolérance, le refus du rejeu, le chiffrement du secret au repos — relève de
 * l'appelant, et aucune bibliothèque ne le ferait à sa place.
 *
 * ── Ce qui n'est PAS ici, et pourquoi ─────────────────────────────────────
 * Le refus du rejeu. Un code valide reste valide pendant sa fenêtre : quelqu'un
 * qui l'intercepte peut le rejouer dans les trente secondes. C'est à l'appelant
 * de mémoriser le dernier pas accepté par utilisateur — voir
 * `AdminAuthService`, qui le fait.
 */

/** Durée d'un pas, en secondes. Trente est la valeur retenue par tous les
 *  générateurs grand public : la changer casse Google Authenticator. */
const STEP_SECONDS = 30;

/** Longueur du code. Six chiffres, comme partout ailleurs dans le produit. */
const DIGITS = 6;

/**
 * Nombre de pas acceptés de part et d'autre du pas courant.
 *
 * Un pas avant, un pas après. L'horloge d'un téléphone dérive, et quelqu'un qui
 * commence à taper à la 29ᵉ seconde valide à la 31ᵉ. Sans tolérance, ces deux
 * situations produisent un échec inexplicable pour l'utilisateur.
 *
 * Deux pas et plus élargiraient la fenêtre d'interception sans rien résoudre de
 * plus : au-delà d'une minute de dérive, c'est l'horloge qu'il faut corriger.
 */
const DEFAULT_WINDOW = 1;

/** Alphabet base32 (RFC 4648), sans rembourrage. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Engendre un secret partagé.
 *
 * Vingt octets : la taille de sortie de SHA-1, recommandée par la RFC 4226.
 * Plus court affaiblirait, plus long n'apporterait rien puisque HMAC réduit de
 * toute façon la clé à la taille du bloc.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Calcule le code attendu pour un instant donné. */
export function generateTotp(secret: string, at: Date = new Date()): string {
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/**
 * Vérifie un code, avec tolérance d'horloge.
 *
 * Renvoie le PAS accepté plutôt qu'un booléen : l'appelant en a besoin pour
 * refuser un rejeu du même code (voir l'en-tête du fichier). Un booléen
 * l'obligerait à recalculer le pas lui-même, ou à s'en passer.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { at?: Date; window?: number } = {},
): { valid: boolean; step: number | null } {
  const normalized = code.replace(/\D/g, '');

  if (normalized.length !== DIGITS) return { valid: false, step: null };

  const at = options.at ?? new Date();
  const window = options.window ?? DEFAULT_WINDOW;
  const current = Math.floor(at.getTime() / 1000 / STEP_SECONDS);

  const key = base32Decode(secret);

  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset;
    const expected = hotp(key, step);

    // Comparaison à temps constant : comparer deux codes à six chiffres avec
    // `===` laisse fuiter, par la durée, combien de chiffres correspondent.
    // L'attaque est théorique sur un réseau, gratuite à empêcher.
    if (constantTimeEquals(expected, normalized)) {
      return { valid: true, step };
    }
  }

  return { valid: false, step: null };
}

/**
 * URI d'enrôlement, à encoder en QR code.
 *
 * Le format `otpauth://` est compris par toutes les applications
 * d'authentification. L'émetteur apparaît dans leur liste : sans lui, un
 * administrateur qui gère plusieurs plateformes voit six codes anonymes.
 */
export function buildTotpUri(input: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = input.issuer ?? 'Nexa-Kabi';
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(input.accountName)}`;

  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Mot de passe à usage unique fondé sur un compteur (RFC 4226).
 *
 * Le compteur est écrit sur huit octets en gros-boutiste. `writeBigUInt64BE`
 * plutôt qu'une arithmétique sur `number` : au-delà de 2^53, un entier flottant
 * perd des unités, et le compteur y arrive — lentement, mais l'écrire juste ne
 * coûte rien.
 */
function hotp(key: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', key).update(buffer).digest();

  /**
   * Troncature dynamique (RFC 4226 §5.3).
   *
   * Les quatre bits de poids faible du dernier octet désignent où lire les
   * quatre octets du code — c'est ce qui empêche un code de toujours provenir
   * de la même portion du condensat.
   *
   * ── L'invariant qui rend ces lectures sûres ────────────────────────────
   * SHA-1 produit exactement vingt octets, et `& 0x0f` borne `offset` à 15.
   * L'octet le plus loin lu est donc `digest[18]`, toujours dans les bornes.
   *
   * `readUInt32BE` plutôt que quatre accès indexés : il fait le contrôle de
   * bornes lui-même et lève si l'invariant était rompu, là où quatre `!`
   * demanderaient au lecteur de refaire ce raisonnement à chaque relecture.
   */
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;

  // Le bit de poids fort est masqué : il rendrait l'entier négatif sur certains
  // condensats, et un code sur six chiffres ne s'en remettrait pas.
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}

export function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  // Le rembourrage et les espaces sont tolérés : les applications
  // d'authentification affichent souvent le secret par groupes de quatre.
  const normalized = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);

    if (index === -1) {
      throw new Error(`Caractère invalide dans le secret base32 : « ${character} »`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}
