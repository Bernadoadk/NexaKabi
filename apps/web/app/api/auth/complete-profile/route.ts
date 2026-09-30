import { NextResponse, type NextRequest } from 'next/server';
import type { SessionUser, UserInterests } from '@nexakabi/contracts';
import { apiFetchAuthenticated } from '@/lib/session';

/**
 * Étape 3 de l'inscription — et correction du profil depuis « Mon compte ».
 *
 * ── Un écran, quatre routes ─────────────────────────────────────────────────
 * Le profil (nom, e-mail) a sa route ; les goûts, la sélection hebdomadaire et
 * la newsletter ont chacun la leur, celle que les réglages rappellent ensuite.
 * Ce relais les enchaîne pour que l'écran n'ait qu'un bouton.
 *
 * Seul le profil est bloquant : c'est lui qui termine l'inscription. Les trois
 * autres sont des préférences — si l'une échoue, le compte existe quand même,
 * et la personne la retrouvera dans ses réglages. La réponse le signale
 * (`incomplete`) plutôt que de faire échouer tout l'écran.
 */
export async function POST(request: NextRequest) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    fullName?: unknown;
    email?: unknown;
    avatarUrl?: unknown;
    interests?: UserInterests;
    recommendations?: unknown;
    newsletter?: unknown;
  };

  const { interests, recommendations, newsletter, ...profile } = body;

  const result = await apiFetchAuthenticated<SessionUser>('/auth/me/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });

  if (!result.ok) {
    return NextResponse.json(result.error, { status: result.error.statusCode });
  }

  const incomplete: string[] = [];

  if (interests && (interests.categoryIds?.length > 0 || interests.cityIds?.length > 0)) {
    const saved = await apiFetchAuthenticated('/me/interests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(interests),
    });
    if (!saved.ok) incomplete.push('interests');
  }

  if (recommendations === true) {
    const saved = await apiFetchAuthenticated('/me/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendations: true }),
    });
    if (!saved.ok) incomplete.push('recommendations');
  }

  if (newsletter === true && result.data.email) {
    const saved = await apiFetchAuthenticated('/me/newsletter?origine=inscription', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed: true }),
    });
    if (!saved.ok) incomplete.push('newsletter');
  }

  return NextResponse.json({ ...result.data, incomplete });
}
