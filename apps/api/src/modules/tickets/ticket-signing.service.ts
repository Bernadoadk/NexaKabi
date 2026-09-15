import { createPrivateKey, createPublicKey, hkdfSync, sign as nodeSign } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildQrToken, packQrPayload, toBase64Url, fromBase64Url } from '@nexakabi/utils';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Version du schéma de dérivation.
 *
 * Elle entre dans le calcul de la clé : la changer produit de nouvelles clés
 * pour tous les événements. Elle n'existe que pour permettre une rotation
 * globale si le schéma devait évoluer — les billets déjà émis restent
 * vérifiables grâce à `signatureKeyId`, qui enregistre la version utilisée.
 */
const DERIVATION_VERSION = 'v1';

/**
 * Préfixe DER d'une clé privée Ed25519 au format PKCS#8.
 *
 * Node sait construire une clé Ed25519 depuis du DER, pas depuis une graine
 * brute de 32 octets. Ces 16 octets sont l'en-tête ASN.1 fixe qui déclare
 * « clé privée Ed25519, 32 octets de contenu » ; il suffit d'y concaténer la
 * graine. C'est le seul endroit du code qui manipule de l'ASN.1 à la main, et
 * il est figé par la norme (RFC 8410).
 */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export interface EventSigningMaterial {
  readonly keyId: string;
  /** Clé publique brute, 32 octets, en base64url. Distribuable aux contrôleurs. */
  readonly publicKey: string;
}

/**
 * Signature des billets.
 *
 * ── Pourquoi une clé par événement ──────────────────────────────────────────
 * Une clé unique pour toute la plateforme ferait d'une fuite une catastrophe :
 * tous les billets de tous les organisateurs deviendraient forgeables. Une clé
 * par événement circonscrit l'incident à cet événement, et permet de la révoquer
 * sans toucher au reste.
 *
 * ── Pourquoi une clé DÉRIVÉE, et non stockée ────────────────────────────────
 * La clé privée n'existe nulle part : ni en base, ni dans un fichier. Elle est
 * recalculée à la demande depuis un secret maître, l'identifiant de l'événement
 * et la version du schéma. Une copie de la base de données ne permet donc pas
 * de forger un seul billet — ce qui n'aurait pas été vrai si on l'y avait
 * rangée, fût-ce chiffrée.
 *
 * Seule la clé PUBLIQUE est stockée, parce qu'elle est distribuée aux
 * contrôleurs et qu'elle ne permet que de vérifier.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §7.3.
 */
@Injectable()
export class TicketSigningService {
  private readonly logger = new Logger(TicketSigningService.name);
  private readonly masterSecret: Buffer;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    // Le poivre OTP sert aussi de secret maître au MVP : un secret dédié devra
    // être introduit avant la mise en production, avec sa propre rotation.
    this.masterSecret = Buffer.from(config.get('TICKET_SIGNING_SECRET', { infer: true }), 'utf8');
  }

  /**
   * Matériel de signature d'un événement, créé au premier billet émis.
   *
   * Prend la transaction en paramètre : la clé et le billet naissent ensemble
   * ou pas du tout. Une clé enregistrée sans billet serait inoffensive, mais un
   * billet signé par une clé absente de la base serait invérifiable.
   */
  async ensureKey(tx: Prisma.TransactionClient, eventId: string): Promise<EventSigningMaterial> {
    const existing = await tx.eventSigningKey.findUnique({ where: { eventId } });

    if (existing) {
      /**
       * La clé publique stockée doit correspondre au secret maître actuel.
       *
       * ── La panne silencieuse que ce contrôle empêche ────────────────────
       * `TICKET_SIGNING_SECRET` change — rotation, migration, restauration
       * d'une sauvegarde avec la mauvaise configuration. Les clés déjà en base
       * ne bougent pas, puisqu'elles existent. Les billets émis ENSUITE sont
       * alors signés par une clé privée dérivée du nouveau secret, tandis que
       * les contrôleurs reçoivent l'ancienne clé publique.
       *
       * Rien ne le signale : l'émission réussit, le billet s'affiche, le PDF
       * se télécharge. La panne n'apparaît qu'à la porte de l'événement, sur
       * chaque billet, un par un — et il est alors trop tard.
       *
       * Refuser d'émettre est le bon sens de l'échec : un billet qu'on ne peut
       * pas vendre vaut mieux qu'un billet vendu qu'on ne peut pas honorer.
       */
      const derived = this.derivePublicKey(eventId, existing.keyId);

      if (derived !== existing.publicKey) {
        this.logger.error(
          `Clé de signature incohérente pour l'événement ${eventId} : la clé publique ` +
            `enregistrée ne dérive pas du TICKET_SIGNING_SECRET actuel.`,
        );

        throw new Error(
          'Le secret de signature des billets ne correspond plus aux clés enregistrées. ' +
            "Les billets émis seraient invérifiables au contrôle d'accès. " +
            'Restaurez le secret d’origine, ou régénérez les clés des événements concernés ' +
            '— ce qui invalide les QR déjà distribués.',
        );
      }

      return { keyId: existing.keyId, publicKey: existing.publicKey };
    }

    const keyId = DERIVATION_VERSION;
    const publicKey = this.derivePublicKey(eventId, keyId);

    await tx.eventSigningKey.create({
      data: {
        eventId,
        keyId,
        publicKey,
        // Aucun secret ici : seulement la façon de le retrouver.
        privateKeyRef: `derived:${DERIVATION_VERSION}`,
      },
    });

    this.logger.log(`Clé de signature créée pour l'événement ${eventId}`);

    return { keyId, publicKey };
  }

  /** Clé publique d'un événement, pour la vérification hors ligne. */
  async findPublicKey(eventId: string): Promise<EventSigningMaterial | null> {
    const key = await this.prisma.eventSigningKey.findUnique({ where: { eventId } });
    return key ? { keyId: key.keyId, publicKey: key.publicKey } : null;
  }

  /**
   * Produit le jeton QR complet d'un billet.
   *
   * @returns le jeton `NK1.<charge>.<signature>` et la signature seule, qui est
   *          la seule chose stockée — la charge utile se recalcule.
   */
  signTicket(input: {
    eventId: string;
    keyId: string;
    ticketPublicId: string;
    eventShortCode: string;
    qrExpiresAt: Date;
  }): { qrToken: string; signature: string } {
    const payload = packQrPayload({
      ticketPublicId: input.ticketPublicId,
      eventShortCode: input.eventShortCode,
      expiresAt: input.qrExpiresAt,
    });

    const signature = nodeSign(null, payload, this.derivePrivateKey(input.eventId, input.keyId));

    return {
      qrToken: buildQrToken(payload, new Uint8Array(signature)),
      signature: toBase64Url(new Uint8Array(signature)),
    };
  }

  /**
   * Reconstruit le jeton d'un billet déjà émis.
   *
   * La signature est stockée, la charge utile ne l'est pas : elle se recalcule
   * depuis les champs du billet. Stocker les deux inviterait à ce qu'ils
   * divergent.
   */
  rebuildToken(input: {
    ticketPublicId: string;
    eventShortCode: string;
    qrExpiresAt: Date;
    signature: string;
  }): string {
    return buildQrToken(
      packQrPayload({
        ticketPublicId: input.ticketPublicId,
        eventShortCode: input.eventShortCode,
        expiresAt: input.qrExpiresAt,
      }),
      fromBase64Url(input.signature),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Graine de 32 octets propre à un événement.
   *
   * HKDF-SHA256 : le sel est l'identifiant de l'événement, l'info la version du
   * schéma. Deux événements ne peuvent pas obtenir la même graine, et connaître
   * l'une n'apprend rien sur les autres.
   */
  private deriveSeed(eventId: string, keyId: string): Buffer {
    return Buffer.from(
      hkdfSync('sha256', this.masterSecret, Buffer.from(eventId, 'utf8'), `nk-ticket-${keyId}`, 32),
    );
  }

  private derivePrivateKey(eventId: string, keyId: string) {
    return createPrivateKey({
      key: Buffer.concat([PKCS8_ED25519_PREFIX, this.deriveSeed(eventId, keyId)]),
      format: 'der',
      type: 'pkcs8',
    });
  }

  private derivePublicKey(eventId: string, keyId: string): string {
    const jwk = createPublicKey(this.derivePrivateKey(eventId, keyId)).export({ format: 'jwk' });

    // `x` est déjà la clé publique brute de 32 octets, en base64url.
    return String(jwk.x);
  }
}
