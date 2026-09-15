import { NextResponse, type NextRequest } from 'next/server';
import type { Session } from '@nexakabi/contracts';
import { API_URL } from '@/lib/api';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from '@/lib/session';
import {
  applyContentSecurityPolicy,
  generateNonce,
  isSameOriginRequest,
} from '@/lib/security-headers';

/**
 * Renouvellement transparent de la session.
 *
 * ── Le trou que ce fichier bouche ───────────────────────────────────────────
 * Le jeton d'accès est un JWT de 15 minutes ; le jeton de rafraîchissement dure
 * 90 jours, révocable, et `POST /auth/refresh` existe côté API depuis le début
 * — mais rien côté web ne l'appelait jamais. Résultat : au bout de 15 minutes,
 * `getCurrentUser()` se prend un 401 et traite un visiteur toujours « connecté »
 * (au sens du jeton de 90 jours) comme un inconnu.
 *
 * Un composant serveur ne peut pas poser de cookie — seul le middleware le
 * peut, avant que la page ne se construise. C'est pour ça que ce fichier
 * existe, et pas un simple appel de plus dans `session.ts`.
 *
 * ── La course qu'il faut éviter ─────────────────────────────────────────────
 * Le rafraîchissement fait tourner le jeton : l'ancien devient inutilisable dès
 * que le nouveau est émis, et le réutiliser est traité côté API comme un vol
 * (toute la lignée est alors révoquée). Une page qui déclenche plusieurs
 * requêtes presque simultanées verrait donc chacune tenter SON propre
 * rafraîchissement avec le même jeton déjà consommé par la première.
 * `refreshesInFlight` fait attendre aux requêtes concurrentes le même appel
 * réseau plutôt que d'en refaire un — efficace tant qu'une seule instance de
 * serveur les reçoit (le cas ici), pas une garantie multi-instance.
 */

const REFRESH_BUFFER_SECONDS = 120;

/**
 * Issue d'un rafraîchissement.
 *
 * Distinguer un jeton REFUSÉ d'une API INJOIGNABLE est ce qui évite de
 * déconnecter quelqu'un parce que sa 3G a hoqueté : dans le premier cas les
 * cookies sont morts et on les efface ; dans le second on n'y touche pas —
 * la requête suivante retentera, avec le même jeton, encore valide.
 */
type RefreshOutcome =
  | { session: Session }
  | { session: null; reason: 'rejected' | 'unreachable' };

const refreshesInFlight = new Map<string, Promise<RefreshOutcome>>();

export async function middleware(request: NextRequest): Promise<NextResponse> {
  /**
   * Barrière anti-requête forgée, avant toute autre chose.
   *
   * Les relais de cette application acceptent `POST` et `PATCH` sur la seule
   * foi d'un cookie. `sameSite: 'lax'` bloque déjà l'essentiel, mais il dépend
   * du navigateur ; ce contrôle-ci n'en dépend pas.
   */
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { statusCode: 403, code: 'CROSS_ORIGIN', message: 'Requête refusée.' },
      { status: 403 },
    );
  }

  // Ces routes gèrent leur propre cycle de cookies ; les aider ici ne ferait
  // qu'introduire une interaction avec la réponse qu'elles construisent elles-mêmes.
  if (request.nextUrl.pathname.startsWith('/api/auth/')) {
    return withSecurityHeaders(request);
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return withSecurityHeaders(request);

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const expiresAt = accessToken ? decodeJwtExpiry(accessToken) : null;
  const secondsLeft = expiresAt === null ? null : expiresAt - Date.now() / 1000;

  const needsRefresh = secondsLeft === null || secondsLeft < REFRESH_BUFFER_SECONDS;
  if (!needsRefresh) return withSecurityHeaders(request);

  const outcome = await refreshOnce(refreshToken);
  const response = withSecurityHeaders(request);

  if (outcome.session) {
    setSessionCookies(response, outcome.session);
  } else if (outcome.reason === 'rejected') {
    // Jeton mort — expiré, révoqué, ou déjà consommé par une requête
    // concurrente : autant l'effacer que redemander un rafraîchissement à
    // chaque requête suivante pour le même échec.
    clearSessionCookies(response);
  }
  // API injoignable : on garde les cookies. La page se dégrade (visiteur
  // anonyme le temps d'une requête), la session revient avec le réseau.

  return response;
}

/**
 * Construit la réponse suivante en y posant la politique de sécurité.
 *
 * Le nonce doit voyager dans les en-têtes de REQUÊTE : c'est là que Next le
 * lit pour l'apposer sur les scripts qu'il génère. D'où la reconstruction des
 * en-têtes plutôt qu'un simple `NextResponse.next()`.
 */
function withSecurityHeaders(request: NextRequest): NextResponse {
  // Ordre imposé : le nonce doit être posé sur les en-têtes AVANT que
  // `NextResponse.next()` ne les fige. Voir `applyContentSecurityPolicy`.
  const nonce = generateNonce();
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });
  applyContentSecurityPolicy(nonce, response);

  return response;
}

function refreshOnce(refreshToken: string): Promise<RefreshOutcome> {
  const existing = refreshesInFlight.get(refreshToken);
  if (existing) return existing;

  const promise = requestRefresh(refreshToken).finally(() => {
    refreshesInFlight.delete(refreshToken);
  });
  refreshesInFlight.set(refreshToken, promise);
  return promise;
}

async function requestRefresh(refreshToken: string): Promise<RefreshOutcome> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    // 401/403 : le jeton est refusé. Une 5xx est une panne, pas un verdict.
    if (response.status === 401 || response.status === 403) {
      return { session: null, reason: 'rejected' };
    }

    if (!response.ok) return { session: null, reason: 'unreachable' };

    return { session: (await response.json()) as Session };
  } catch {
    return { session: null, reason: 'unreachable' };
  }
}

/** Lit `exp` sans vérifier la signature : l'API reste seule à faire autorité,
 *  ceci ne sert qu'à décider s'il vaut la peine de tenter un rafraîchissement. */
function decodeJwtExpiry(token: string): number | null {
  const segment = token.split('.')[1];
  if (!segment) return null;

  try {
    const payload: unknown = JSON.parse(base64UrlDecode(segment));
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(segment: string): string {
  let base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  return atob(base64);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|scanner-sw.js|manifest.webmanifest|scan/app-manifest).*)',
  ],
};
