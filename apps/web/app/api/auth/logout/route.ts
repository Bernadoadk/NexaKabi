import { NextResponse, type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api';
import { clearSessionCookies, readRefreshToken } from '@/lib/session';

/**
 * Déconnexion.
 *
 * Les cookies sont effacés même si l'API échoue : laisser un cookie derrière
 * soi après un clic sur « se déconnecter » serait la pire des issues.
 */
export async function POST(request: NextRequest) {
  const refreshToken = await readRefreshToken();
  const body = (await request.json().catch(() => ({}))) as { allDevices?: boolean };

  if (refreshToken) {
    await apiFetch('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, allDevices: body.allDevices ?? false }),
    });
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);

  return response;
}
