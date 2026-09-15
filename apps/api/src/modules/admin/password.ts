import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * `promisify(scrypt)` choisit la surcharge SANS options, et le paramètre de
 * coût passerait silencieusement à la trappe — avec les valeurs par défaut,
 * bien plus faibles. La promesse est donc construite à la main, sur la
 * surcharge qui accepte les options.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Hachage des mots de passe d'administration.
 *
 * ── Pourquoi scrypt et non Argon2id ───────────────────────────────────────
 * Argon2id serait le premier choix dans l'absolu, et le schéma de base le
 * mentionnait. Il exige une dépendance native, compilée par plateforme, qui
 * casse les installations Windows et alourdit l'image de production — pour
 * quelques comptes d'administration.
 *
 * `scrypt` est dans Node, sans dépendance, et reste un KDF sérieux : il est
 * conçu contre les attaques matérielles, exactement comme Argon2. Les
 * paramètres ci-dessous suivent les recommandations de l'OWASP.
 *
 * Le commentaire du schéma Prisma a été corrigé en conséquence : une
 * documentation qui annonce Argon2id là où tourne scrypt est pire que pas de
 * documentation du tout.
 *
 * ── Ce que ce fichier ne protège pas ──────────────────────────────────────
 * Le mot de passe n'est que la PREMIÈRE étape. Aucun accès n'est ouvert sans le
 * code TOTP qui suit : un mot de passe volé, même en clair, ne donne rien.
 */

/**
 * Paramètres de coût.
 *
 * `N = 2^17` demande environ 128 Mo et une centaine de millisecondes par calcul.
 * C'est délibérément lent : une seconde d'attente à la connexion est
 * imperceptible, mais multiplie par un million le coût d'une attaque par
 * dictionnaire sur la base volée.
 */
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * `maxmem` doit dépasser `128 * N * r`, sinon Node refuse le calcul. La valeur
 * par défaut (32 Mo) est en dessous de ce que demandent nos paramètres — le
 * relever ici évite une erreur qui ne se manifesterait qu'à la première
 * connexion en production.
 */
const MAX_MEMORY = 256 * 1024 * 1024;

/** Préfixe de format, pour reconnaître l'algorithme lors d'une future migration. */
const PREFIX = 'scrypt$1';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });

  return `${PREFIX}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Vérifie un mot de passe.
 *
 * Ne lève jamais : une empreinte corrompue en base doit se traduire par un refus
 * de connexion, pas par une erreur 500 qui révèle l'état interne.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algorithm, version, saltB64, hashB64] = stored.split('$');

    if (`${algorithm}$${version}` !== PREFIX || !saltB64 || !hashB64) return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');

    const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: MAX_MEMORY,
    });

    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Engendre des codes de secours.
 *
 * ── À quoi ils servent réellement ─────────────────────────────────────────
 * Un téléphone perdu ou réinitialisé enferme définitivement l'administrateur
 * dehors : le secret TOTP est parti avec l'appareil. Sans code de secours, la
 * seule issue serait une intervention en base de données — c'est-à-dire une
 * porte dérobée permanente, bien plus dangereuse que dix codes imprimés.
 *
 * Format `XXXX-XXXX` : recopié à la main depuis une feuille de papier, donc
 * groupé et sans caractères ambigus.
 */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const characters = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % 32]);

    return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
  });
}

/** Normalise un code de secours saisi : casse et tiret sont indifférents. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
