import { createParamDecorator, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { OrgContext, OrgScopedRequest } from '../guards/org-member.guard';

/**
 * Injecte l'organisation active et le rôle de l'appelant.
 *
 * Lève si le garde n'a pas résolu de contexte : mieux vaut échouer bruyamment
 * qu'exécuter une action sur une organisation indéterminée.
 */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrgContext => {
    const request = context.switchToHttp().getRequest<OrgScopedRequest>();

    if (!request.organization) {
      throw new ForbiddenException('Aucune organisation active pour cette requête.');
    }

    return request.organization;
  },
);
