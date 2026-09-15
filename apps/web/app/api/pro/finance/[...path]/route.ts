import { NextResponse, type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api';
import { readAccessToken } from '@/lib/session';
import { resolveActiveOrganizationId } from '@/lib/organizations';

/**
 * Relais des finances.
 *
 * Le jeton de session reste dans son cookie httpOnly. Sur un écran qui manipule
 * de l'argent, un jeton lisible par le JavaScript de la page serait la faille
 * la plus coûteuse du produit.
 *
 * ── Correctif ────────────────────────────────────────────────────────────
 * Ces routes finance n'ont pas de segment `eventId` dont l'organisation
 * pourrait se déduire côté API (`OrgMemberGuard`) : sans `X-Organization-Id`,
 * chaque appel — y compris la demande de retrait de `payout-form.tsx` —
 * échouait avec « Aucune organisation indiquée ». L'organisation active vit
 * dans le même cookie que celui lu par les pages serveur (`orgFetch`).
 */
const ALLOWED = /^(payouts|payouts\/quote|balance|statement)$/;

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const target = path.join('/');

  if (!ALLOWED.test(target)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Cette ressource n'existe pas." },
      { status: 404 },
    );
  }

  const [accessToken, organizationId] = await Promise.all([
    readAccessToken(),
    resolveActiveOrganizationId(),
  ]);
  const body = request.method === 'GET' ? undefined : await request.text();

  const result = await apiFetch<unknown>(`/organizer/finance/${target}${request.nextUrl.search}`, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(organizationId ? { 'X-Organization-Id': organizationId } : {}),
    },
    body,
  });

  return result.ok
    ? NextResponse.json(result.data)
    : NextResponse.json(result.error, { status: result.error.statusCode });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}
