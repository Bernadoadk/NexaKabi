import { NextResponse, type NextRequest } from 'next/server';
import type { SessionUser } from '@nexakabi/contracts';
import { apiFetchAuthenticated } from '@/lib/session';

/** Étape 3 de l'inscription : nom, e-mail facultatif, consentement. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => ({}));

  const result = await apiFetchAuthenticated<SessionUser>('/auth/me/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    return NextResponse.json(result.error, { status: result.error.statusCode });
  }

  return NextResponse.json(result.data);
}
