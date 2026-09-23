import { NextResponse, type NextRequest } from 'next/server';
import type { Order } from '@nexakabi/contracts';
import { apiFetch } from '@/lib/api';
import { CHECKOUT_COOKIE, checkoutCookieOptions, checkoutHeaders } from '@/lib/checkout';

/**
 * Relais du tunnel d'achat.
 *
 * Le navigateur ne parle jamais directement à l'API : il passe par ici. Ce
 * relais attache le jeton de commande, qui reste dans un cookie httpOnly et
 * n'est donc jamais lisible par du JavaScript de la page.
 *
 * Un seul point d'entrée pour toutes les étapes : la surface est petite, et
 * chaque étape supplémentaire du tunnel n'ajoute pas un fichier de plus à
 * maintenir en parallèle du contrôleur.
 */

/** Segments autorisés. Une liste fermée : ce relais n'ouvre pas toute l'API. */
const ALLOWED =
  /^orders(\/[A-Za-z0-9-]+(\/(buyer|confirm|cancel|tickets|payment-methods|payments(\/[A-Za-z0-9_-]+)?))?)?$/;

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const target = path.join('/');

  if (!ALLOWED.test(target)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Cette ressource n'existe pas." },
      { status: 404 },
    );
  }

  const body = request.method === 'GET' ? undefined : await request.text();

  const result = await apiFetch<unknown>(`/checkout/${target}`, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      // L'adresse reelle est ecrite par le proxy d'entree, jamais relayee
      // depuis le navigateur : un en-tete `x-forwarded-for` recopie du client
      // laisserait n'importe qui choisir l'adresse que l'API enregistre, et
      // contourner toute limitation par IP.
      'user-agent': request.headers.get('user-agent') ?? '',
      ...(await checkoutHeaders()),
    },
    body,
  });

  if (!result.ok) {
    return NextResponse.json(result.error, { status: result.error.statusCode });
  }

  const payload = result.data as { order?: Order; checkoutToken?: string };

  // La création de commande renvoie le jeton une seule fois. Il est posé en
  // cookie et retiré de la réponse : la page n'a aucune raison de le voir.
  if (payload.checkoutToken && payload.order) {
    const response = NextResponse.json(payload.order);
    response.cookies.set(CHECKOUT_COOKIE, payload.checkoutToken, checkoutCookieOptions);
    return response;
  }

  return NextResponse.json(result.data);
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, (await context.params).path);
}
