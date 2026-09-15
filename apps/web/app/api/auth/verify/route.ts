import { NextResponse, type NextRequest } from 'next/server';
import type { Session } from '@nexakabi/contracts';
import { apiFetch } from '@/lib/api';
import { setSessionCookies } from '@/lib/session';

/** Vérifie le code et pose les cookies de session. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => ({}));

  const result = await apiFetch<Session>('/auth/otp/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // L'adresse reelle est ecrite par le proxy d'entree, jamais relayee
      // depuis le navigateur : un en-tete `x-forwarded-for` recopie du client
      // laisserait n'importe qui choisir l'adresse que l'API enregistre, et
      // contourner toute limitation par IP.
      'user-agent': request.headers.get('user-agent') ?? '',
    },
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    return NextResponse.json(result.error, { status: result.error.statusCode });
  }

  // Les jetons ne franchissent jamais la frontière du navigateur.
  const { accessToken: _accessToken, refreshToken: _refreshToken, ...safe } = result.data;
  const response = NextResponse.json(safe);
  setSessionCookies(response, result.data);

  return response;
}
