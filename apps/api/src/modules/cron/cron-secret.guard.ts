import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/env';

/**
 * Garde des déclencheurs de tâches périodiques.
 *
 * Un seul secret partagé, présenté en `Authorization: Bearer …` : le format
 * que n'importe quel planificateur sait produire — cron-job.org le prend dans
 * ses en-têtes personnalisés, Vercel Cron l'envoie de lui-même quand la
 * variable `CRON_SECRET` existe sur le projet.
 *
 * Secret non configuré = endpoints fermés. Un service qui tourne en mode
 * `in-process` n'a aucune raison d'être déclenché de l'extérieur, et un
 * secret vide comparé à un en-tête vide donnerait… une égalité.
 *
 * Les deux valeurs sont réduites par SHA-256 avant la comparaison à temps
 * constant : `timingSafeEqual` exige deux tampons de même longueur, et
 * refuser plus tôt sur la longueur révélerait celle du secret.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get('CRON_SECRET', { infer: true });

    if (!secret) {
      throw new ForbiddenException('Déclenchement externe des tâches désactivé.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const presented = bearerToken(request.headers.authorization);

    if (!presented || !sameSecret(presented, secret)) {
      throw new ForbiddenException('Secret de planification invalide.');
    }

    return true;
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

function sameSecret(presented: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}
