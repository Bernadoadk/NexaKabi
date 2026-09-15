import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Chiffrement au repos des secrets d'administration.
 *
 * ── Ce que ce fichier protège, et de quoi ─────────────────────────────────
 * Le secret TOTP d'un administrateur est le SECOND facteur. Le mot de passe est
 * dérivé par scrypt, les codes de secours sont hachés — mais le secret TOTP
 * était stocké en clair, alors que le commentaire du schéma affirmait le
 * contraire. Une copie de la base livrait donc les graines de tous les
 * administrateurs, et la double authentification cessait d'apporter quoi que ce
 * soit dans le seul scénario contre lequel elle vaut : la base a fui.
 *
 * ── Pourquoi un chiffrement et non un hachage ─────────────────────────────
 * Un mot de passe se vérifie, un secret TOTP doit être RELU pour recalculer le
 * code attendu. Le hacher est impossible ; le chiffrer avec une clé qui ne vit
 * pas dans la base est la seule protection qui tienne.
 *
 * ── AES-256-GCM ───────────────────────────────────────────────────────────
 * Chiffrement authentifié : le déchiffrement échoue si un octet a été modifié,
 * plutôt que de rendre des données silencieusement fausses. Un vecteur
 * d'initialisation aléatoire par écriture — le réutiliser sur GCM est la faute
 * classique, et elle est fatale.
 *
 * ── Format ────────────────────────────────────────────────────────────────
 *   enc.v1.<iv_base64url>.<tag_base64url>.<chiffré_base64url>
 *
 * Le préfixe versionné permet deux choses : reconnaître une valeur héritée en
 * clair — le contenu existant n'a pas de préfixe — et faire tourner
 * l'algorithme plus tard sans deviner ce qu'on relit.
 */

const PREFIX = 'enc.v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Dérive la clé de 32 octets attendue par AES-256.
 *
 * `ADMIN_ENCRYPTION_KEY` est une chaîne de configuration de longueur libre :
 * SHA-256 la ramène à la taille exacte, sans imposer d'encodage particulier à
 * qui renseigne la variable.
 */
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export function encryptSecret(plaintext: string, key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(key), iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return [PREFIX, toBase64Url(iv), toBase64Url(cipher.getAuthTag()), toBase64Url(encrypted)].join(
    '.',
  );
}

/**
 * Déchiffre une valeur, ou rend telle quelle une valeur héritée.
 *
 * ── Pourquoi le clair est toléré ──────────────────────────────────────────
 * Les secrets déjà en base n'ont pas de préfixe. Refuser de les lire
 * enfermerait dehors tous les administrateurs existants — un correctif de
 * sécurité qui coupe l'accès à l'administration n'est pas appliqué, il est
 * annulé. Ils sont donc lus, puis rechiffrés à la première occasion par
 * `reencryptIfNeeded`.
 *
 * @returns `null` si la valeur est chiffrée mais illisible : mauvaise clé, ou
 *          contenu altéré. Un refus de connexion vaut mieux qu'un code TOTP
 *          calculé sur des octets faux.
 */
export function decryptSecret(stored: string, key: string): string | null {
  if (!stored.startsWith(`${PREFIX}.`)) {
    return stored;
  }

  // Le préfixe compte DEUX segments — `enc` et `v1` —, d'où les deux trous
  // avant l'IV. Les compter comme un seul décalait tout le découpage et faisait
  // échouer chaque déchiffrement, sans que rien ne le signale : `decrypt` ne
  // rend que `null`, indistinct d'une clé fausse.
  const [, , ivPart, tagPart, dataPart] = stored.split('.');

  if (!ivPart || !tagPart || !dataPart) return null;

  try {
    const decipher = createDecipheriv(ALGORITHM, deriveKey(key), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // `final()` lève quand l'étiquette d'authentification ne correspond pas.
    return null;
  }
}

/** Vrai si la valeur stockée est encore en clair et mérite d'être rechiffrée. */
export function needsEncryption(stored: string): boolean {
  return !stored.startsWith(`${PREFIX}.`);
}
