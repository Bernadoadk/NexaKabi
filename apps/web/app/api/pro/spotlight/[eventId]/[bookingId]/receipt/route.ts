import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';
import { resolveActiveOrganizationId } from '@/lib/organizations';
import { readAccessToken } from '@/lib/session';

/**
 * Reçu d'une place à la une, en PDF.
 *
 * Relayé plutôt que servi par l'API en lien direct : le jeton de session
 * reste dans son cookie httpOnly, et le navigateur ne connaît qu'une origine.
 * L'API revérifie que l'événement — et donc la place — appartient bien à
 * l'organisation du membre connecté.
 */
const ID = /^[\w-]{8,64}$/;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string; bookingId: string }> },
): Promise<Response> {
  const { eventId, bookingId } = await context.params;

  if (!ID.test(eventId) || !ID.test(bookingId)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Ce reçu n'existe pas." },
      { status: 404 },
    );
  }

  const [accessToken, organizationId] = await Promise.all([
    readAccessToken(),
    resolveActiveOrganizationId(),
  ]);

  if (!accessToken) {
    return NextResponse.json(
      { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Connecte-toi pour continuer.' },
      { status: 401 },
    );
  }

  const upstream = await fetch(
    `${API_URL}/organizer/events/${encodeURIComponent(eventId)}/spotlight/bookings/${encodeURIComponent(bookingId)}/receipt.pdf`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(organizationId ? { 'X-Organization-Id': organizationId } : {}),
      },
      cache: 'no-store',
    },
  );

  if (!upstream.ok) {
    const payload: unknown = await upstream.json().catch(() => null);
    return NextResponse.json(
      payload ?? { statusCode: upstream.status, code: 'UPSTREAM', message: 'Reçu indisponible.' },
      { status: upstream.status },
    );
  }

  return new Response(await upstream.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? 'attachment; filename="recu.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}
