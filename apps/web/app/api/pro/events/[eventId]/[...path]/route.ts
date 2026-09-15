import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';
import { readAccessToken } from '@/lib/session';

/**
 * Relais des ressources d'un événement, côté organisateur.
 *
 * L'export CSV passe ici plutôt que par un lien direct vers l'API : le jeton de
 * session reste dans son cookie httpOnly, et le navigateur ne connaît qu'une
 * seule origine.
 */
const ALLOWED = /^(attendees|attendees\.csv|stats)$/;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string; path: string[] }> },
): Promise<Response> {
  const { eventId, path } = await context.params;
  const target = path.join('/');

  if (!ALLOWED.test(target)) {
    return NextResponse.json(
      { statusCode: 404, code: 'NOT_FOUND', message: "Cette ressource n'existe pas." },
      { status: 404 },
    );
  }

  const accessToken = await readAccessToken();

  const upstream = await fetch(
    `${API_URL}/organizer/finance/events/${encodeURIComponent(eventId)}/${target}`,
    {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      cache: 'no-store',
    },
  );

  if (!upstream.ok) {
    const payload: unknown = await upstream.json().catch(() => null);
    return NextResponse.json(
      payload ?? { statusCode: upstream.status, code: 'UPSTREAM', message: 'Erreur.' },
      { status: upstream.status },
    );
  }

  if (target.endsWith('.csv')) {
    return new Response(await upstream.text(), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="participants-${eventId}.csv"`,
      },
    });
  }

  return NextResponse.json(await upstream.json());
}
