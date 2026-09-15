import 'server-only';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

/**
 * Session d'administration.
 *
 * ── Un cookie distinct, et c'est tout l'intérêt ───────────────────────────
 * `nk_admin`, jamais `nk_access`. Servis depuis des domaines différents, les
 * deux cookies ne se croisent jamais : une session participant volée n'ouvre
 * rien ici, et une session d'administration ne circule pas avec les requêtes du
 * site public.
 *
 * `httpOnly` et `sameSite: 'strict'` — plus strict que le site public, où
 * `lax` est nécessaire pour que le retour d'un paiement conserve la session.
 * L'administration n'a aucun flux de retour externe : rien ne justifie
 * d'assouplir.
 */

const ADMIN_COOKIE = 'nk_admin';

const isProduction = process.env.NODE_ENV === 'production';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000/api';

export function setAdminCookie(response: NextResponse, token: string, expiresAt: string): void {
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.delete(ADMIN_COOKIE);
}

export async function readAdminToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value;
}

export interface AdminUser {
  id: string;
  fullName: string;
  role: string;
}

/**
 * Récupère l'administrateur courant, ou `null`.
 *
 * ── Pourquoi cet appel touche l'API à chaque rendu ────────────────────────
 * Le jeton n'est pas un JWT : c'est une référence opaque, vérifiée côté serveur.
 * Une session révoquée cesse donc d'ouvrir des portes IMMÉDIATEMENT, sans
 * attendre l'expiration d'un jeton signé. Pour une console qui donne accès aux
 * pièces d'identité de tous les organisateurs, c'est le bon compromis.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const token = await readAdminToken();

  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!response.ok) return null;

    return (await response.json()) as AdminUser;
  } catch {
    // API injoignable : traiter comme non connecté. Afficher un écran
    // d'administration à moitié rempli serait pire — on ne saurait pas si les
    // données affichées sont à jour.
    return null;
  }
}

/** Appel authentifié vers l'API d'administration. */
export async function adminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const token = await readAdminToken();

  try {
    const response = await fetch(`${API_URL}/admin${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (payload as { message?: string } | null)?.message ?? `L’API a répondu ${response.status}.`;

      return { ok: false, message };
    }

    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, message: 'L’API n’est pas joignable.' };
  }
}
