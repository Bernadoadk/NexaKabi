import { NextResponse, type NextRequest } from 'next/server';
import { recordSpotlightViewsSchema } from '@nexakabi/contracts';
import { apiFetch } from '@/lib/api';

/**
 * Mesure de la une : vues groupées et clics vers un événement de la plateforme.
 *
 * Le navigateur écrit ici par `sendBeacon`, qui n'attend pas de réponse : on
 * répond toujours 204, même quand l'API est injoignable. Une mesure perdue ne
 * doit jamais se voir.
 *
 * Les clics vers une billetterie externe ne passent pas par ici : ils passent
 * par `/go/une/[id]`, qui les compte avant de rediriger.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const payload: unknown = await request.json().catch(() => null);
  const body = (payload ?? {}) as { views?: unknown; click?: unknown };

  if (body.views !== undefined) {
    const parsed = recordSpotlightViewsSchema.safeParse({ ids: body.views });

    if (parsed.success) {
      await apiFetch('/spotlights/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
    }
  } else if (typeof body.click === 'string' && /^[\w-]{8,64}$/.test(body.click)) {
    await apiFetch(`/spotlights/${encodeURIComponent(body.click)}/click`, { method: 'POST' });
  }

  return new NextResponse(null, { status: 204 });
}
