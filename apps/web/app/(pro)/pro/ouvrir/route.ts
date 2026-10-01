import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  ACTIVE_ORG_COOKIE,
  ACTIVE_ORG_COOKIE_MAX_AGE,
  listOrganizations,
} from '@/lib/organizations';

/**
 * Ouvre une page de l'espace organisateur DANS la bonne organisation.
 *
 * ── Pourquoi ce détour existe ───────────────────────────────────────────────
 * L'organisation active d'une personne est mémorisée dans un cookie. Quelqu'un
 * qui en gère deux et touche la notification de la seconde — une vente, un
 * retrait — arriverait sur la page d'un événement qui n'appartient pas à
 * l'organisation du cookie : une page introuvable, pour une notification qui
 * venait pourtant d'annoncer quelque chose de réel.
 *
 * `organizationLink` (contrats) écrit ces liens ; cette route les lit. Elle
 * vérifie que la personne appartient bien à l'organisation nommée — le cookie n'a
 * aucune valeur de sécurité, l'API revérifie tout, mais mieux vaut ne pas
 * poser une valeur qui ne mènerait qu'à des erreurs —, la rend active, puis
 * redirige.
 *
 * ── Ce qu'elle refuse ───────────────────────────────────────────────────────
 * Toute destination qui n'est pas un chemin de `/pro` : sans cela, `?suite=`
 * ferait de ce lien un tremplin de redirection ouverte.
 */
export async function GET(request: NextRequest): Promise<Response> {
  // Un préchargement n'est pas un geste : cette route pose un cookie, et le faire
  // sur une simple intention d'ouvrir un lien — avant tout clic — changerait
  // d'organisation sans que la personne l'ait voulu. Les liens qui y mènent
  // coupent déjà le préchargement ; ceci garde la route sûre même si l'un d'eux
  // l'oubliait.
  if (
    request.headers.has('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('sec-purpose')?.includes('prefetch')
  ) {
    return new NextResponse(null, { status: 204 });
  }

  const { searchParams } = request.nextUrl;

  const organizationId = searchParams.get('org') ?? '';
  const target = proPath(searchParams.get('suite'));

  const user = await getCurrentUser();

  if (!user) {
    // Reprendre ce lien après la connexion : la page de connexion ne garde que
    // des chemins internes, requête comprise.
    const back = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(
      new URL(`/connexion?suite=${encodeURIComponent(back)}`, request.url),
    );
  }

  const response = NextResponse.redirect(new URL(target, request.url));

  if (organizationId) {
    const organizations = await listOrganizations();

    if (organizations.some((organization) => organization.id === organizationId)) {
      response.cookies.set(ACTIVE_ORG_COOKIE, organizationId, {
        path: '/',
        sameSite: 'lax',
        maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
      });
    }
  }

  return response;
}

/** Un chemin de l'espace organisateur, ou le tableau de bord. */
function proPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/pro') || candidate.startsWith('//')) return '/pro';

  // `/professeur` commence aussi par `/pro` : seul `/pro` ou `/pro/…` est le nôtre.
  const next = candidate.charAt(4);
  return next === '' || next === '/' || next === '?' || next === '#' ? candidate : '/pro';
}
