import { NextResponse, type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api';
import { readAccessToken } from '@/lib/session';
import { resolveActiveOrganizationId } from '@/lib/organizations';

/**
 * Relais de la recherche de lieux.
 *
 * Le champ de recherche de l'assistant appelle cette route à chaque frappe
 * (avec un délai). Le jeton de session reste dans son cookie httpOnly, et
 * l'organisation active part en en-tête : l'API vérifie que l'appelant a le
 * droit de modifier des événements avant de dépenser une requête Google.
 */
const ALLOWED = /^(status|search|geocode|[A-Za-z0-9_-]{4,300})$/;

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

  const [accessToken, organizationId] = await Promise.all([
    readAccessToken(),
    resolveActiveOrganizationId(),
  ]);

  const result = await apiFetch<unknown>(
    `/organizer/places/${encodeURIComponent(target)}${request.nextUrl.search}`,
    {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(organizationId ? { 'X-Organization-Id': organizationId } : {}),
      },
    },
  );

  return result.ok
    ? NextResponse.json(result.data)
    : NextResponse.json(result.error, { status: result.error.statusCode });
}
