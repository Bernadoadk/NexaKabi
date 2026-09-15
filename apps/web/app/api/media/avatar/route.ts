import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';
import { readAccessToken } from '@/lib/session';

/**
 * Relais du dépôt de photo de profil.
 *
 * Pas d'organisation ici, volontairement : c'est la photo du COMPTE, pas
 * celle d'une organisation — un participant qui n'en a aucune doit pouvoir
 * la déposer tout autant qu'un organisateur (voir `SelfPlacesController` côté
 * API pour le même raisonnement, appliqué à la recherche de lieux).
 */
export async function POST(request: NextRequest) {
  const accessToken = await readAccessToken();

  if (!accessToken) {
    return NextResponse.json(
      { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Connecte-toi pour continuer.' },
      { status: 401 },
    );
  }

  const body = await request.formData();

  const response = await fetch(`${API_URL}/media/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });

  const payload: unknown = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
}
