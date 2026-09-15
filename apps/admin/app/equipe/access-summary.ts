import { ADMIN_SPACES, type AdminAccess } from '@nexakabi/contracts';

/**
 * Résumé lisible des droits, pour une liste ou une fiche.
 *
 * Module sans directive : appelé par des composants SERVEUR (la liste de
 * l'équipe, « Mon compte ») — une fonction exportée d'un module client n'y
 * arriverait que sous forme de référence, pas de fonction.
 */
export function describeAccess(access: AdminAccess, canMoveMoney: boolean): string {
  const parts = ADMIN_SPACES.filter((space) => access[space.key]).map(
    (space) => `${space.label}${access[space.key] === 'act' ? '' : ' (lecture)'}`,
  );

  if (canMoveMoney) parts.push('Argent');

  return parts.length > 0 ? parts.join(' · ') : 'Aucun accès';
}
