import type { ApiError } from '@nexakabi/contracts';

/**
 * Client d'accès à l'API.
 *
 * L'URL est lue côté serveur uniquement : les appels du navigateur passeront
 * plus tard par les route handlers de Next (BFF), afin que le jeton de session
 * reste dans un cookie httpOnly et ne transite jamais par du JavaScript client.
 */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000/api';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  checks: { database: 'up' | 'down' };
  timestamp: string;
  /** Absents en production : une sonde publique n'annonce pas sa version. */
  version?: string;
  environment?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Appelle l'API sans jamais lever d'exception.
 *
 * Une API injoignable dégrade l'affichage, elle ne casse pas la page — c'est la
 * même règle que pour le mode hors ligne : « on dégrade la fonctionnalité, on ne
 * coupe pas l'accès ».
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { revalidate?: number },
): Promise<ApiResult<T>> {
  const { revalidate, ...requestInit } = init ?? {};

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...requestInit,
      headers: { Accept: 'application/json', ...requestInit.headers },
      next: revalidate === undefined ? { revalidate: 0 } : { revalidate },
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        error: (payload as ApiError | null) ?? {
          statusCode: response.status,
          code: 'UNEXPECTED_RESPONSE',
          message: "L'API a répondu de façon inattendue.",
        },
      };
    }

    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      error: {
        statusCode: 503,
        code: 'API_UNREACHABLE',
        message: "L'API n'est pas joignable. Vérifie qu'elle est démarrée sur le port 4000.",
      },
    };
  }
}

export function fetchHealth(): Promise<ApiResult<HealthStatus>> {
  return apiFetch<HealthStatus>('/health');
}
