import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../auth.service';

/**
 * Contexte de la requête : adresse IP et agent utilisateur.
 *
 * Sert à limiter le débit, à nommer l'appareil et à tracer les connexions.
 *
 * ── Pourquoi `request.ip` et non `x-forwarded-for` ────────────────────────
 * Lire l'en-tête soi-même revient à croire le client sur parole : n'importe
 * qui peut alors annoncer l'adresse de son choix, contourner toute limitation
 * par IP et faire écrire au journal d'audit l'adresse d'un tiers.
 *
 * `request.ip` applique la chaîne de confiance configurée par
 * `app.set('trust proxy', 1)` dans `main.ts` : Express ne retient de
 * `x-forwarded-for` que ce qu'un intermédiaire de confiance a écrit, et
 * ignore le reste.
 *
 * L'agent utilisateur reste déclaratif par nature — il ne sert qu'à nommer un
 * appareil dans la liste des sessions, jamais à autoriser quoi que ce soit.
 */
export const ReqContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const request = context.switchToHttp().getRequest<Request>();

    return {
      ipAddress: request.ip ?? undefined,
      userAgent: request.headers['user-agent']?.slice(0, 500),
    };
  },
);
