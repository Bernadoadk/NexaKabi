import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, clearAdminCookie, readAdminToken, setAdminCookie } from '@/lib/session';

/**
 * Relais vers l'API d'administration.
 *
 * ── Ce que ce fichier protège ─────────────────────────────────────────────
 * Le jeton reste dans un cookie `httpOnly` : aucun script de la page ne peut
 * le lire, donc une faille XSS dans la console ne le fait pas fuir. Le
 * navigateur ne parle jamais directement à l'API — il passe par ici.
 *
 * ── La liste blanche ──────────────────────────────────────────────────────
 * `[...path]` accepte n'importe quel chemin par construction. Sans filtre, ce
 * relais deviendrait un proxy ouvert vers toute l'API, authentifié avec le
 * cookie de la victime. Chaque route utilisée par la console est donc déclarée
 * explicitement ci-dessous.
 */
const ALLOWED: readonly RegExp[] = [
  /^auth\/login$/,
  /^auth\/logout$/,
  /^auth\/password$/,
  /^staff$/,
  /^staff\/[\w-]+$/,
  /^staff\/[\w-]+\/status$/,
  /^staff\/[\w-]+\/password$/,
  /^dashboard$/,
  /^verifications$/,
  /^verifications\/[\w-]+$/,
  /^verifications\/[\w-]+\/decision$/,
  /^events$/,
  /^events\/[\w-]+$/,
  /^events\/[\w-]+\/decision$/,
  /^reports$/,
  /^reports\/[\w-]+$/,
  /^reports\/[\w-]+\/assign$/,
  /^reports\/[\w-]+\/notes$/,
  /^reports\/[\w-]+\/resolution$/,
  /^payouts\/[\w-]+\/execute$/,
  /^organizations\/[\w-]+\/freeze$/,
  /^organizations\/[\w-]+\/unfreeze$/,
];

async function relay(
  request: NextRequest,
  path: string[],
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
): Promise<Response> {
  const target = path.join('/');

  if (!ALLOWED.some((pattern) => pattern.test(target))) {
    return NextResponse.json({ message: 'Cette ressource n’existe pas.' }, { status: 404 });
  }

  const token = await readAdminToken();
  const body = method === 'GET' || method === 'DELETE' ? undefined : await request.text();

  const upstream = await fetch(`${API_URL}/admin/${target}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    cache: 'no-store',
  });

  const payload: unknown = await upstream.json().catch(() => null);

  if (upstream.ok && target === 'auth/login') {
    const session = payload as { token?: string; expiresAt?: string } | null;

    if (session?.token && session.expiresAt) {
      // Le jeton est RETIRÉ du corps avant d'être renvoyé.
      //
      // Le poser en cookie `httpOnly` tout en le laissant dans la réponse JSON
      // ne protégerait rien : le script de la page le lirait dans le corps, et
      // une faille XSS le trouverait là. Il ne sort d'ici que dans l'en-tête
      // `Set-Cookie`, que le JavaScript ne peut pas lire.
      const { token: _token, ...withoutToken } = session;

      const response = NextResponse.json(withoutToken, { status: upstream.status });
      setAdminCookie(response, session.token, session.expiresAt);

      return response;
    }
  }

  const response = NextResponse.json(payload ?? {}, { status: upstream.status });

  if (target === 'auth/logout') {
    clearAdminCookie(response);
  }

  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return relay(request, path, 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return relay(request, path, 'POST');
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return relay(request, path, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return relay(request, path, 'DELETE');
}
