import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_TTL_SECONDS, type GlobalRole } from '@nexakabi/contracts';

/** Audience des jetons de session. Distingue leur usage de tout autre jeton. */
export const ACCESS_TOKEN_AUDIENCE = 'session';

export interface AccessTokenPayload {
  /** Identifiant de l'utilisateur. */
  sub: string;
  role: GlobalRole;
  /** Identifiant de l'appareil, pour tracer la session. */
  did: string;
}

export interface IssuedRefreshToken {
  /** Jeton en clair, remis au client une seule fois. */
  readonly token: string;
  /** Empreinte à stocker en base. */
  readonly hash: string;
}

/**
 * Émission et vérification des jetons.
 *
 * Deux natures de jeton, volontairement différentes :
 *   — l'ACCÈS est un JWT court (15 min), vérifiable sans toucher la base ;
 *   — le RAFRAÎCHISSEMENT est opaque et aléatoire (90 jours), stocké haché,
 *     donc révocable immédiatement.
 *
 * Un JWT longue durée serait irrévocable : c'est précisément ce qu'on refuse
 * pour une session de 90 jours.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      audience: ACCESS_TOKEN_AUDIENCE,
    });
  }

  /**
   * Vérifie un jeton d'accès.
   *
   * ── Pourquoi l'audience et l'émetteur sont exigés ici ────────────────────
   * `verifyAsync` ne contrôle QUE ce qu'on lui demande de contrôler : sans ces
   * deux options, n'importe quel JWT signé par la même clé passait, quel que
   * soit son usage d'origine. Les secrets sont désormais distincts par usage,
   * mais un contrôle qui repose sur la seule séparation des clés retombe au
   * premier partage de secret — et ces partages arrivent.
   *
   * La charge utile est vérifiée en plus : un jeton valide mais dépourvu de
   * rôle ou d'appareil n'est pas un jeton de session.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: 'nexa-kabi',
    });

    if (!payload.sub || !payload.role || !payload.did) {
      throw new Error("Charge utile de jeton d'accès incomplète.");
    }

    return payload;
  }

  /** 256 bits d'entropie : indevinable, et sans structure exploitable. */
  issueRefreshToken(): IssuedRefreshToken {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  /**
   * SHA-256 sans sel ni dérivation lente : le jeton porte déjà 256 bits
   * d'entropie, il n'y a rien à deviner. Le hachage sert uniquement à ce qu'une
   * fuite de la base ne livre pas de session utilisable.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Identifiant de lignée, partagé par tous les jetons issus d'une même connexion. */
  newTokenFamily(): string {
    return randomUUID();
  }
}
