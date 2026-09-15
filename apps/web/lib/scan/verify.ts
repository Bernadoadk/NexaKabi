import { decideCheckIn, type CheckInDecision, type ManifestEntry } from '@nexakabi/contracts';
import { fromBase64Url, parseQrToken } from '@nexakabi/utils';

/**
 * Vérification d'un billet, hors ligne.
 *
 * ── Pourquoi ce fichier n'utilise pas simplement `verifyQrToken` ────────────
 * `@nexakabi/utils` vérifie avec WebCrypto, qui n'a reçu Ed25519 que dans des
 * navigateurs très récents — Chrome 137, Safari 17. Or la cible de ce produit
 * est précisément un Android d'entrée de gamme, parfois plus ancien que ça, à
 * la porte d'un concert et sans réseau pour se mettre à jour.
 *
 * Un contrôleur dont le téléphone refuserait TOUS les billets serait la panne
 * la plus visible du produit. Ce module détecte donc la capacité une fois,
 * puis bascule sur une implémentation logicielle si nécessaire. Celle-ci n'est
 * téléchargée QUE dans ce cas : les appareils récents n'en paient pas le poids.
 */

/**
 * `<ArrayBuffer>` explicite : WebCrypto refuse un tampon potentiellement
 * partagé, et `Uint8Array` seul s'infère en `ArrayBufferLike`.
 */
type Ed25519Verifier = (
  signature: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>,
  publicKey: Uint8Array<ArrayBuffer>,
) => Promise<boolean>;

/** Résultat de la détection, calculé une seule fois par session. */
let verifierPromise: Promise<{ verify: Ed25519Verifier; source: 'webcrypto' | 'fallback' }> | null =
  null;

/**
 * Choisit l'implémentation de vérification.
 *
 * La détection est faite par un ESSAI RÉEL, pas par une lecture de version :
 * certains navigateurs exposent l'algorithme sans le supporter, et il vaut
 * mieux le découvrir au démarrage du scanner qu'au premier billet.
 */
async function resolveVerifier(): Promise<{
  verify: Ed25519Verifier;
  source: 'webcrypto' | 'fallback';
}> {
  verifierPromise ??= (async () => {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(32),
        { name: 'Ed25519' },
        false,
        ['verify'],
      );

      // Une clé toute à zéro n'est pas une clé valide : on ne teste pas le
      // résultat, seulement que l'appel aboutit sans lever.
      await crypto.subtle.verify('Ed25519', key, new Uint8Array(64), new Uint8Array(1));

      return {
        source: 'webcrypto' as const,
        verify: async (signature, message, publicKey) => {
          const imported = await crypto.subtle.importKey(
            'raw',
            publicKey,
            { name: 'Ed25519' },
            false,
            ['verify'],
          );
          return crypto.subtle.verify('Ed25519', imported, signature, message);
        },
      };
    } catch {
      // Chargement dynamique : ~10 Ko, payés uniquement par les appareils qui
      // en ont besoin.
      const ed = await import('@noble/ed25519');

      return {
        source: 'fallback' as const,
        verify: async (signature, message, publicKey) => {
          try {
            return ed.verify(signature, message, publicKey);
          } catch {
            // Une signature malformée fait lever la bibliothèque ; du point de
            // vue du contrôleur, c'est un billet invalide, pas un plantage.
            return false;
          }
        },
      };
    }
  })();

  return verifierPromise;
}

/** Implémentation retenue, pour l'affichage de diagnostic. */
export async function verifierSource(): Promise<'webcrypto' | 'fallback'> {
  return (await resolveVerifier()).source;
}

export interface OfflineVerifyInput {
  /** Contenu brut du QR scanné. */
  token: string;
  /** Clé publique de l'événement, en base64url, issue du carnet. */
  publicKey: string;
  eventShortCode: string;
  /** Index du carnet, par identifiant public de billet. */
  manifest: ReadonlyMap<string, ManifestEntry>;
  /** Ce billet a-t-il déjà été scanné sur cet appareil ? */
  locallyScanned?: boolean;
  now?: Date;
}

/**
 * Rend le verdict complet d'un billet scanné.
 *
 * Applique les cinq étapes du prototype : authenticité d'abord, unicité
 * ensuite. Ne lève jamais — un contrôleur a besoin d'un verdict, pas d'une
 * exception.
 */
export async function verifyOffline(input: OfflineVerifyInput): Promise<CheckInDecision> {
  let parsed;

  try {
    parsed = parseQrToken(input.token);
  } catch {
    // Code étranger au produit, ou QR abîmé. Le contrôleur doit réessayer,
    // pas appeler un responsable : c'est le sens de « illisible ».
    return decideCheckIn({ signature: 'malformed' });
  }

  const { verify } = await resolveVerifier();

  const authentic = await verify(
    parsed.signatureBytes,
    parsed.payloadBytes,
    fromBase64Url(input.publicKey),
  );

  if (!authentic) {
    return decideCheckIn({
      signature: 'bad_signature',
      ticketPublicId: parsed.payload.ticketPublicId,
    });
  }

  // L'événement AVANT l'expiration : « billet d'un autre événement » est une
  // information plus utile au contrôleur, et les deux peuvent être vrais.
  if (parsed.payload.eventShortCode !== input.eventShortCode) {
    return decideCheckIn({
      signature: 'wrong_event',
      ticketPublicId: parsed.payload.ticketPublicId,
    });
  }

  const now = input.now ?? new Date();

  if (parsed.payload.expiresAt.getTime() < now.getTime()) {
    return decideCheckIn({ signature: 'expired', ticketPublicId: parsed.payload.ticketPublicId });
  }

  return decideCheckIn({
    signature: 'valid',
    ticketPublicId: parsed.payload.ticketPublicId,
    entry: input.manifest.get(parsed.payload.ticketPublicId),
    locallyScanned: input.locallyScanned,
  });
}
