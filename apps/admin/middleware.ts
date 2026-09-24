import { NextResponse, type NextRequest } from 'next/server';
import {
  applyContentSecurityPolicy,
  generateNonce,
  isSameOriginRequest,
} from '@/lib/security-headers';

/**
 * Garde d'entrée de la console.
 *
 * ── Ce qu'il fait, et ce qu'il ne fait PAS ────────────────────────────────
 * Il redirige vers la connexion quand aucun cookie n'est présent. C'est une
 * COMMODITÉ, pas une sécurité : il regarde l'existence du cookie, jamais sa
 * validité, et un cookie forgé passerait sans difficulté.
 *
 * L'autorisation réelle est vérifiée par l'API à chaque appel, contre une
 * session en base — le jeton est une référence opaque, pas un JWT. Un
 * middleware qui prétendrait décider seul donnerait une fausse impression de
 * protection, et la première refonte l'affaiblirait sans que rien ne casse.
 *
 * Sa vraie utilité : éviter d'afficher une console vide et clignotante à
 * quelqu'un qui n'est pas connecté.
 *
 * ── Ce qu'il fait AUSSI, et qui relève bien de la sécurité ────────────────
 * Il pose la politique de sécurité du contenu et refuse les requêtes mutantes
 * venues d'une autre origine. Ces deux contrôles-là ne peuvent pas vivre dans
 * `next.config.ts` : le premier a besoin d'un nonce par réponse, le second de
 * voir la requête.
 */
export function middleware(request: NextRequest) {
  /**
   * Requête mutante venue d'ailleurs : refus sec.
   *
   * Le cookie de la console est déjà en `sameSite: 'strict'`, la protection la
   * plus forte que le navigateur propose. Ce contrôle ne dépend, lui, d'aucun
   * réglage de navigateur — et cette console gèle des fonds.
   */
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ message: 'Requête refusée.' }, { status: 403 });
  }

  const hasCookie = request.cookies.has('nk_admin');
  const { pathname } = request.nextUrl;

  /**
   * La redirection ne concerne QUE les pages.
   *
   * Rediriger un appel `fetch` vers une page HTML produit « Unexpected token
   * < », dont personne ne devine la cause — et le relais de connexion, appelé
   * précisément quand aucun cookie n'existe encore, ne partirait jamais.
   */
  const isPageRequest = !pathname.startsWith('/api/');
  const isLoginPage = pathname === '/connexion';

  if (isPageRequest && !hasCookie && !isLoginPage) {
    return NextResponse.redirect(new URL('/connexion', request.url));
  }

  // Ordre imposé : le nonce doit être posé sur les en-têtes AVANT que
  // `NextResponse.next()` ne les fige. Voir `applyContentSecurityPolicy`.
  const nonce = generateNonce();
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });

  /**
   * Politique STRICTE, plus fermée que celle du site public.
   *
   * La console n'affiche que ses propres écrans : aucune image de domaine
   * tiers, aucune police externe, aucun cadre. Tout ce qu'un organisateur a
   * déposé — un visuel d'événement, une pièce justificative — est servi par
   * l'API sur notre propre origine. Rien ne justifie d'ouvrir davantage.
   */
  applyContentSecurityPolicy(nonce, response, { strict: true });

  return response;
}

export const config = {
  /**
   * Tout, y compris `/api`.
   *
   * ── Pourquoi `/api` n'est plus exclu ──────────────────────────────────────
   * Il l'était pour que le relais réponde en JSON plutôt qu'une redirection
   * HTML — un `fetch` redirigé vers une page produit l'erreur « Unexpected
   * token < », dont personne ne devine la cause. La redirection reste donc
   * réservée aux pages, mais le contrôle d'origine, lui, doit s'appliquer AUX
   * ROUTES D'API en premier lieu : ce sont elles qui mutent quelque chose.
   *
   * ── Sauf les images de marque ────────────────────────────────────────────
   * Logo (`icons/`) et icônes générées (`icon/…`, `apple-icon`) : sans cookie,
   * la redirection vers la connexion les remplacerait par une page HTML — et
   * l'écran de connexion, précisément, s'afficherait sans logo ni favicon.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|icon/|apple-icon).*)'],
};
