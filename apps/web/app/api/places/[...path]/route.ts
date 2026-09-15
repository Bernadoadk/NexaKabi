import { NextResponse, type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api';
import { readAccessToken } from '@/lib/session';

/**
 * Relais de la recherche de lieux pour son PROPRE profil.
 *
 * Variante de `api/pro/places` sans organisation active : utile à la création
 * d'une organisation (aucune n'existe encore) et à ses paramètres. Le jeton de
 * session suffit — voir `SelfPlacesController` côté API pour le pourquoi.
 */
const ALLOWED = /^(search|[A-Za-z0-9_-]{4,300})$/;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const target = path.join('/');

  if (!ALLOWED.test(target)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Cette ressource n'existe pas." },
      { status: 404 },
    );
  }

  const accessToken = await readAccessToken();

  const result = await apiFetch<unknown>(
    `/places/${encodeURIComponent(target)}${request.nextUrl.search}`,
    { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  );

  return result.ok
    ? NextResponse.json(result.data)
    : NextResponse.json(result.error, { status: result.error.statusCode });
}
