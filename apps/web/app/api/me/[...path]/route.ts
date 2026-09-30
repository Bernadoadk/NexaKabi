import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';
import { readAccessToken } from '@/lib/session';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Relais des réglages du participant : goûts, suivis, appareils, newsletter.
 *
 * Même raison que les autres relais : le jeton de session reste dans son cookie
 * httpOnly, et le navigateur ne connaît qu'une seule origine.
 *
 * ── La liste blanche ─────────────────────────────────────────────────────────
 * `[...path]` accepte n'importe quoi par construction. Sans filtre, ce relais
 * deviendrait un proxy ouvert vers toute l'API, authentifié avec le cookie de
 * la victime. Chaque cible est déclarée, avec les méthodes qu'elle accepte.
 */
const ROUTES: ReadonlyArray<{ pattern: RegExp; methods: readonly Method[] }> = [
  { pattern: /^interests$/, methods: ['GET', 'PUT'] },
  { pattern: /^recommendations$/, methods: ['GET'] },
  { pattern: /^follows$/, methods: ['GET'] },
  { pattern: /^follows\/[a-z0-9-]{1,120}$/, methods: ['GET', 'PUT', 'DELETE'] },
  { pattern: /^push$/, methods: ['GET'] },
  { pattern: /^push\/subscriptions$/, methods: ['POST'] },
  { pattern: /^push\/unsubscribe$/, methods: ['POST'] },
  { pattern: /^newsletter$/, methods: ['GET', 'PUT'] },
];

async function relay(request: NextRequest, path: string[], method: Method): Promise<Response> {
  const target = path.join('/');
  const route = ROUTES.find((entry) => entry.pattern.test(target));

  if (!route || !route.methods.includes(method)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Cette ressource n'existe pas." },
      { status: 404 },
    );
  }

  const accessToken = await readAccessToken();
  const body = method === 'GET' || method === 'DELETE' ? undefined : await request.text();

  const upstream = await fetch(`${API_URL}/me/${target}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      // Le libellé d'un appareil abonné (« Chrome sur Android ») vient de là :
      // sans lui, l'API ne verrait que le client HTTP de ce serveur.
      'user-agent': request.headers.get('user-agent') ?? '',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body,
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json(
      { statusCode: 503, code: 'API_UNREACHABLE', message: "L'API n'est pas joignable." },
      { status: 503 },
    );
  }

  const payload: unknown = await upstream.json().catch(() => null);

  return NextResponse.json(payload ?? {}, { status: upstream.status });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  return relay(request, (await context.params).path, 'GET');
}

export async function POST(request: NextRequest, context: Context): Promise<Response> {
  return relay(request, (await context.params).path, 'POST');
}

export async function PUT(request: NextRequest, context: Context): Promise<Response> {
  return relay(request, (await context.params).path, 'PUT');
}

export async function DELETE(request: NextRequest, context: Context): Promise<Response> {
  return relay(request, (await context.params).path, 'DELETE');
}
