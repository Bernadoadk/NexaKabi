import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { AuthenticatedRequest } from '../../auth/guards/session.guard';
import { CheckoutTokenService } from '../checkout-token.service';

/** En-tête portant le jeton de checkout, relayé par le BFF Next.js. */
export const CHECKOUT_TOKEN_HEADER = 'x-checkout-token';

/**
 * Accès à une commande en cours.
 *
 * Deux portes, et deux seulement :
 *   · le jeton de checkout émis à la création de la commande — c'est la porte
 *     de l'acheteur sans compte, qui représente l'essentiel du trafic ;
 *   · une session dont l'utilisateur est le propriétaire de la commande, pour
 *     retrouver un paiement interrompu depuis « Mes commandes ».
 *
 * La référence seule ne suffit JAMAIS : six caractères hexadécimaux affichés à
 * l'écran et communiqués au support ne sont pas un secret.
 */
@Injectable()
export class CheckoutAccessGuard implements CanActivate {
  constructor(
    private readonly tokens: CheckoutTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const reference = String(
      (request.params as Record<string, unknown>).reference ?? '',
    ).toUpperCase();

    if (!reference) {
      throw new ForbiddenException('Référence de commande manquante.');
    }

    const header = request.headers[CHECKOUT_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;

    if (token) {
      await this.tokens.verify(token, reference);
      return true;
    }

    if (request.user) {
      const owned = await this.prisma.order.findFirst({
        where: { reference, userId: request.user.id },
        select: { id: true },
      });

      if (owned) return true;
    }

    throw new ForbiddenException(
      'Cette commande ne t’appartient pas, ou ton lien de paiement a expiré.',
    );
  }
}
