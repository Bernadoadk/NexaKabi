import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Durée de validité d'un jeton de checkout : la réservation dure 30 minutes. */
const CHECKOUT_TOKEN_TTL_SECONDS = 45 * 60;

export interface CheckoutTokenPayload {
  /** Identifiant de la commande. */
  sub: string;
  /** Référence lisible, vérifiée en plus de l'identifiant. */
  ref: string;
  scope: 'checkout';
}

/**
 * Jeton d'accès à une commande en cours.
 *
 * L'achat sans compte est une décision de conversion majeure (voir
 * PROJECT_ANALYSIS.md §8, A3) : le tunnel doit donc fonctionner sans session.
 * Mais une référence de commande ne fait que 6 caractères hexadécimaux — elle
 * est lisible sur un écran, communicable au support, et par conséquent
 * DEVINABLE. Elle ne peut pas servir d'autorisation à elle seule.
 *
 * À la création de la commande, le serveur émet ce jeton signé et le navigateur
 * le conserve en cookie httpOnly. Il ouvre l'accès à UNE commande, pendant la
 * durée de sa réservation, et à rien d'autre.
 */
@Injectable()
export class CheckoutTokenService {
  constructor(private readonly jwt: JwtService) {}

  async issue(orderId: string, reference: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: orderId, ref: reference, scope: 'checkout' } satisfies CheckoutTokenPayload,
      { expiresIn: CHECKOUT_TOKEN_TTL_SECONDS },
    );
  }

  /**
   * Vérifie qu'un jeton ouvre bien l'accès à la commande demandée.
   *
   * Le contrôle porte à la fois sur la portée et sur la référence : un jeton de
   * session ne doit pas donner accès à un checkout, et un jeton de checkout ne
   * doit pas donner accès à la commande d'un autre.
   */
  async verify(token: string, reference: string): Promise<CheckoutTokenPayload> {
    let payload: CheckoutTokenPayload;

    try {
      // L'audience est exigée EXPLICITEMENT : `verifyAsync` ne contrôle que ce
      // qu'on lui demande de contrôler, et un jeton d'un autre usage ne doit
      // jamais ouvrir une commande.
      payload = await this.jwt.verifyAsync<CheckoutTokenPayload>(token, {
        audience: 'checkout',
        issuer: 'nexa-kabi',
      });
    } catch {
      throw new UnauthorizedException(
        'Ce lien de commande a expiré. Recommence ta sélection de billets.',
      );
    }

    if (payload.scope !== 'checkout' || payload.ref !== reference) {
      throw new UnauthorizedException('Ce jeton ne donne pas accès à cette commande.');
    }

    return payload;
  }
}
