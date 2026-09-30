import type { ConfigService } from '@nestjs/config';
import type { Env } from './env';

/**
 * Adresses publiques, telles qu'on les écrit dans un e-mail ou une notification.
 *
 * Un lien envoyé hors de l'application ne peut pas être relatif : la boîte de
 * réception n'a pas d'origine. Ces deux fonctions sont le seul endroit qui
 * sait les construire, sans barre oblique finale pour qu'un chemin s'y colle
 * tel quel.
 */

/** Le site public : `PUBLIC_WEB_URL`, à défaut la première origine CORS. */
export function publicWebUrl(config: ConfigService<Env, true>): string {
  const url =
    config.get('PUBLIC_WEB_URL', { infer: true }) ??
    config.get('CORS_ORIGINS', { infer: true })[0] ??
    'http://localhost:3000';

  return url.replace(/\/+$/, '');
}

/** L'API elle-même — pour les liens qu'un client de messagerie appelle directement. */
export function publicApiUrl(config: ConfigService<Env, true>): string {
  return config.get('PUBLIC_API_URL', { infer: true }).replace(/\/+$/, '');
}
