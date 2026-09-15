import { NextResponse, type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api';
import { readAccessToken } from '@/lib/session';

/**
 * Relais du scanner.
 *
 * Le jeton de session ne quitte jamais le cookie httpOnly : la PWA du
 * contrôleur appelle cette route, qui l'attache pour elle. Un jeton lisible par
 * le JavaScript de la page serait exfiltrable, et donnerait accès au carnet
 * complet de l'événement.
 *
 * L'en-tête `ETag` est relayé dans les deux sens : c'est ce qui évite de
 * retélécharger 72 Ko de carnet à chaque ouverture du scanner.
 */
const ALLOWED = /^(manifest|scans|stats|history|conflicts|scans\/[A-Za-z0-9_-]+\/revoke)$/;

async function proxy(request: NextRequest, eventId: string, path: string[]): Promise<NextResponse> {
  const target = path.join('/');

  if (!ALLOWED.test(target)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Cette ressource n'existe pas." },
      { status: 404 },
    );
  }

  const accessToken = await readAccessToken();
  const body = request.method === 'GET' ? undefined : await request.text();
  const knownVersion = request.headers.get('if-none-match');

  const result = await apiFetch<unknown>(
    `/checkin/events/${encodeURIComponent(eventId)}/${target}${request.nextUrl.search}`,
    {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(knownVersion ? { 'If-None-Match': knownVersion } : {}),
      },
      body,
    },
  );

  if (!result.ok) {
    return NextResponse.json(result.error, { status: result.error.statusCode });
  }

  const payload = result.data as { version?: string } | null;
  const response = NextResponse.json(result.data);

  // Le carnet porte sa propre version : on la republie en `ETag` pour que le
  // navigateur puisse la renvoyer au prochain appel.
  if (payload && typeof payload.version === 'string') {
    response.headers.set('ETag', `"${payload.version}"`);
  }

  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string; path: string[] }> },
) {
  const { eventId, path } = await context.params;
  return proxy(request, eventId, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string; path: string[] }> },
) {
  const { eventId, path } = await context.params;
  return proxy(request, eventId, path);
}
