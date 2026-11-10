import { NextResponse, type NextRequest } from 'next/server';
import type { SpotlightClickTarget } from '@nexakabi/contracts';
import { apiFetch } from '@/lib/api';

/**
 * Passage de la une vers une billetterie externe.
 *
 * L'API compte le clic et rend l'adresse du site officiel, enregistrée par
 * l'équipe — jamais une adresse lue dans la requête : cette route ne peut pas
 * servir de redirection ouverte vers un site choisi par un tiers.
 *
 * Si l'API ne répond pas, le visiteur arrive sur Découvrir plutôt que sur une
 * page d'erreur.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const fallback = new URL('/evenements', request.url);

  if (!/^[\w-]{8,64}$/.test(id)) {
    return NextResponse.redirect(fallback, 302);
  }

  const result = await apiFetch<SpotlightClickTarget>(
    `/spotlights/${encodeURIComponent(id)}/click`,
    { method: 'POST' },
  );

  if (!result.ok) {
    return NextResponse.redirect(fallback, 302);
  }

  const target = result.data.url;

  // Une adresse externe n'est suivie qu'en https ; un chemin du site, tel quel.
  const destination = target.startsWith('https://')
    ? target
    : target.startsWith('/') && !target.startsWith('//')
      ? new URL(target, request.url)
      : fallback;

  const response = NextResponse.redirect(destination, 302);
  // La redirection dépend d'un compteur : rien ne doit la garder en cache.
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
