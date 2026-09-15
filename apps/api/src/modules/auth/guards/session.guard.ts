import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { GlobalRole } from '@nexakabi/contracts';
import { TokenService } from '../domain/token.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface AuthenticatedUser {
  readonly id: string;
  readonly role: GlobalRole;
  readonly deviceId: string;
}

/** Requête portant l'utilisateur résolu par le garde. */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Garde de session.
 *
 * Vérifie le jeton d'accès et pose l'utilisateur sur la requête. Aucun
 * contrôleur ne lit le rôle directement : tout passe par les gardes et le
 * décorateur `@CurrentUser()`.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §5.4.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    /**
     * Route publique : la session est FACULTATIVE, pas ignorée.
     *
     * Un jeton valide est tout de même résolu et posé sur la requête. Sans
     * cela, `request.user` restait indéfini sur les routes `@Public()`, et
     * toute logique conditionnée à « si l'appelant est connecté » y était morte
     * — c'était le cas du second chemin d'accès de `CheckoutAccessGuard`, qui
     * devait permettre de reprendre un paiement depuis « Mes commandes ».
     *
     * Un jeton absent ou invalide ne bloque rien ici : la route est publique.
     */
    if (isPublic) {
      if (token) {
        try {
          const payload = await this.tokens.verifyAccessToken(token);
          request.user = { id: payload.sub, role: payload.role, deviceId: payload.did };
        } catch {
          // Visiteur anonyme porteur d'un jeton périmé : rien à signaler.
        }
      }

      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Connecte-toi pour accéder à cette page.');
    }

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      request.user = { id: payload.sub, role: payload.role, deviceId: payload.did };
      return true;
    } catch {
      // Ne jamais distinguer « jeton expiré » de « jeton invalide » :
      // la différence n'aide que l'attaquant.
      throw new UnauthorizedException('Session expirée. Reconnecte-toi avec ton numéro.');
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;

  if (!header) return null;

  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
