import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../guards/session.guard';

/**
 * Injecte l'utilisateur authentifié dans un contrôleur.
 *
 * Lève si la route n'est pas protégée : mieux vaut échouer bruyamment que
 * laisser un contrôleur croire qu'il a un utilisateur alors qu'il n'en a pas.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException('Connecte-toi pour accéder à cette page.');
    }

    return request.user;
  },
);
