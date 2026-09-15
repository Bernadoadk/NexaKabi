import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'nk:isPublic';

/**
 * Rend une route accessible sans session.
 *
 * Le garde de session est appliqué globalement : l'accès public est donc une
 * exception EXPLICITE, jamais un oubli de protection.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
