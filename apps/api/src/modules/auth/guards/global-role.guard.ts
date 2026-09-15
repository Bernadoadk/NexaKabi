import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { GlobalRole } from '@nexakabi/contracts';
import { GLOBAL_ROLES_KEY } from '../decorators/global-roles.decorator';
import type { AuthenticatedRequest } from './session.guard';

/**
 * Garde de rôle plateforme.
 *
 * Ne concerne QUE les rôles globaux (support, administration). Les droits dans
 * une organisation relèvent d'un autre garde, introduit en phase 4 : un même
 * utilisateur peut être simple participant ici et administrateur d'organisation
 * là-bas.
 */
@Injectable()
export class GlobalRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<GlobalRole[]>(GLOBAL_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException("Tu n'as pas accès à cette ressource.");
    }

    return true;
  }
}
