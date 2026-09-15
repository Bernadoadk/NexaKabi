import 'server-only';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import type { Session, SessionUser } from '@nexakabi/contracts';
import { apiFetch, type ApiResult } from './api';

/**
 * Session côté serveur.
 *
 * Les jetons vivent dans des cookies httpOnly : aucun JavaScript de la page ne
 * peut les lire, ce qui neutralise toute une classe d'attaques XSS. Le
 * navigateur ne parle jamais directement à l'API — il passe par les route
 * handlers de cette application, qui font office de BFF.
 */

const ACCESS_COOKIE = 'nk_access';
const REFRESH_COOKIE = 'nk_refresh';

const isProduction = process.env.NODE_ENV === 'production';

/** Pose les deux cookies de session sur une réponse. */
export function setSessionCookies(response: NextResponse, session: Session): void {
  const common = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
  };

  response.cookies.set(ACCESS_COOKIE, session.accessToken, {
    ...common,
    expires: new Date(session.accessTokenExpiresAt),
  });

  response.cookies.set(REFRESH_COOKIE, session.refreshToken, {
    ...common,
    expires: new Date(session.refreshTokenExpiresAt),
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
}

export async function readAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value;
}

export async function readRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value;
}

/**
 * Utilisateur de la session en cours, ou `null`.
 *
 * Ne tente pas de rafraîchir le jeton : un composant serveur ne peut pas poser
 * de cookie. Le renouvellement est déclenché par le middleware, qui le peut.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const accessToken = await readAccessToken();

  if (!accessToken) return null;

  const result = await apiFetch<SessionUser>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return result.ok ? result.data : null;
}

/** Appelle l'API avec le jeton de la session en cours. */
export async function apiFetchAuthenticated<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const accessToken = await readAccessToken();

  return apiFetch<T>(path, {
    ...init,
    headers: {
      ...init?.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
