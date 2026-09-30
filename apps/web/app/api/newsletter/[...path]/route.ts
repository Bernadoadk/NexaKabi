import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';

type Method = 'GET' | 'POST';

/**
 * Relais public de la newsletter : s'inscrire, confirmer, se désabonner.
 *
 * Aucune session n'est transmise : ces routes n'en ont pas besoin, et un lien
 * de désabonnement doit marcher depuis n'importe quel navigateur. La liste
 * blanche reste de rigueur — un relais ouvert l'est pour tout le monde.
 */
const ROUTES: ReadonlyArray<{ target: string; methods: readonly Method[] }> = [
  { target: 'subscriptions', methods: ['POST'] },
  { target: 'subscription', methods: ['GET'] },
  { target: 'confirm', methods: ['POST'] },
  { target: 'unsubscribe', methods: ['POST'] },
];

async function relay(request: NextRequest, path: string[], method: Method): Promise<Response> {
  const target = path.join('/');
  const route = ROUTES.find((entry) => entry.target === target);

  if (!route || !route.methods.includes(method)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Cette ressource n'existe pas." },
      { status: 404 },
    );
  }

  const search = method === 'GET' ? request.nextUrl.search : '';

  const upstream = await fetch(`${API_URL}/newsletter/${target}${search}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? await request.text() : undefined,
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
