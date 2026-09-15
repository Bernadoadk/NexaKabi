import { SetMetadata } from '@nestjs/common';
import type { OrgPermission } from '@nexakabi/contracts';

export const ORG_PERMISSION_KEY = 'nk:orgPermission';

/**
 * Exige une permission d'organisation.
 *
 * La vérification est faite par `OrgMemberGuard`, contre la table de vérité de
 * `@nexakabi/contracts`. Un contrôleur ne compare jamais un rôle lui-même.
 */
export const RequirePermission = (permission: OrgPermission) =>
  SetMetadata(ORG_PERMISSION_KEY, permission);
