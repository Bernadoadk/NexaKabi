import { SetMetadata } from '@nestjs/common';
import type { GlobalRole } from '@nexakabi/contracts';

export const GLOBAL_ROLES_KEY = 'nk:globalRoles';

/** Restreint une route à certains rôles plateforme. */
export const RequireGlobalRole = (...roles: GlobalRole[]) => SetMetadata(GLOBAL_ROLES_KEY, roles);
