import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';
import { readAccessToken } from '@/lib/session';

/**
 * Relais des notifications du participant.
 *
 * Même raison que les autres relais : le jeton de session reste dans son cookie
 * httpOnly, et le navigateur ne connaît qu'une seule origine. Un `fetch` direct
 * vers l'API depuis la page obligerait à exposer le jeton au JavaScript.
 *
 * ── La liste blanche ─────────────────────────────────────────────────────────
 * `[...path]` accepte n'importe quoi par construction. Sans filtre, ce relais
 * deviendrait un proxy ouvert vers toute l'API, authentifié avec le cookie de
 * la victime — la définition même d'un SSRF. Trois cibles suffisent.
 */
const ALLOWED = new Set(['lues', 'preferences']);

async function relay(
  request: NextRequest,
  target: string,
  method: 'GET' | 'POST' | 'PATCH',
): Promise<Response> {
  if (target !== '' && !ALLOWED.has(target)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Cette ressource n'existe pas." },
      { status: 404 },
    );
  }

  const accessToken = await readAccessToken();
  const body = method === 'GET' ? undefined : await request.text();

  const upstream = await fetch(`${API_URL}/me/notifications${target ? `/${target}` : ''}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body,
    cache: 'no-store',
  });

  const payload: unknown = await upstream.json().catch(() => null);

  return NextResponse.json(payload ?? {}, { status: upstream.status });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return relay(request, (path ?? []).join('/'), 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return relay(request, (path ?? []).join('/'), 'POST');
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return relay(request, (path ?? []).join('/'), 'PATCH');
}
