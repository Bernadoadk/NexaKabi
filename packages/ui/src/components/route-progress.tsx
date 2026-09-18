'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { TopProgressBar } from './progress';

/**
 * Le filet de navigation, branché sur les vraies navigations.
 *
 * ── Le problème qu'il règle ───────────────────────────────────────────────
 * Dans l'App Router, un clic sur un lien ne repeint rien tant que le serveur
 * n'a pas répondu. Sur une connexion lente — c'est-à-dire la plupart de nos
 * utilisateurs — il s'écoule une à trois secondes pendant lesquelles l'écran
 * est rigoureusement identique à ce qu'il était avant le clic. L'utilisateur
 * en conclut que son clic n'a pas porté, et il reclique. Puis il souffle.
 *
 * ── Pourquoi écouter les clics plutôt qu'une API de Next ──────────────────
 * Parce que les liens sont partout — barre du bas, tiroir, cartes, fils
 * d'Ariane, boutons `asChild` — et qu'aucun crochet officiel ne rapporte
 * l'état d'une navigation depuis la RACINE de l'arbre : `useLinkStatus` ne
 * parle que sous le `<Link>` qui l'a déclenchée. Il faudrait réécrire chaque
 * lien de l'application pour un filet de trois pixels. Un écouteur en phase de
 * capture voit tous les clics, y compris ceux des composants qu'on n'a pas
 * écrits, et ne coûte rien.
 *
 * ── Pourquoi rien ne s'affiche avant 140 ms ───────────────────────────────
 * Une page déjà préchargée s'ouvre en quarante millisecondes. Y faire
 * clignoter une barre donne une impression de lourdeur exactement là où le
 * produit est rapide. Le filet n'apparaît donc que si l'attente se fait
 * sentir — sinon, personne ne saura jamais qu'il existe.
 */

/** Marqueur à poser sur un lien qui ne doit pas déclencher le filet. */
export const NO_PROGRESS_ATTRIBUTE = 'data-no-progress';

const START_EVENT = 'nk:route-progress-start';

/**
 * Au-delà, on renonce.
 *
 * Le filet s'efface quand l'adresse change. Si elle ne change jamais — requête
 * partie dans le vide sur un réseau qui a lâché, destination qui renvoie sur
 * la page courante — il resterait allumé à quatre-vingt-dix pour cent jusqu'au
 * prochain rechargement, en promettant une page qui n'arrive pas. Mieux vaut
 * qu'il disparaisse : l'utilisateur voit alors qu'il doit recliquer.
 */
const GIVE_UP_AFTER_MS = 20_000;

/**
 * Déclenche le filet à la main.
 *
 * Pour une navigation qui ne part pas d'un lien : `router.push()` après un
 * enregistrement, une redirection décidée par une action de serveur. Sans
 * appel explicite, ces navigations-là restent muettes.
 */
export function startRouteProgress(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(START_EVENT));
}

export function RouteProgress() {
  // `useSearchParams` bascule l'arbre en rendu client s'il n'est pas isolé.
  // Ce composant est monté dans la racine : sans cette frontière, il
  // emporterait toutes les pages avec lui.
  return (
    <React.Suspense fallback={null}>
      <RouteProgressInner />
    </React.Suspense>
  );
}

function RouteProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = React.useState(false);
  const timerRef = React.useRef<number | undefined>(undefined);
  const giveUpRef = React.useRef<number | undefined>(undefined);

  const stop = React.useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (giveUpRef.current !== undefined) {
      window.clearTimeout(giveUpRef.current);
      giveUpRef.current = undefined;
    }
    setActive(false);
  }, []);

  const start = React.useCallback(() => {
    if (giveUpRef.current === undefined) {
      giveUpRef.current = window.setTimeout(() => {
        giveUpRef.current = undefined;
        stop();
      }, GIVE_UP_AFTER_MS);
    }

    if (timerRef.current !== undefined) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      setActive(true);
    }, 140);
  }, [stop]);

  // L'adresse a changé : la page demandée est là.
  React.useEffect(() => {
    stop();
  }, [pathname, searchParams, stop]);

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.hasAttribute(NO_PROGRESS_ATTRIBUTE)) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let destination: URL;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // Un autre site part dans un chargement complet du navigateur, qui a sa
      // propre barre. Une ancre sur la même page ne charge rien.
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }

      start();
    }

    function onPopState() {
      start();
    }

    // Un rechargement complet emporte la page : le filet n'a plus de raison
    // d'être, et le laisser courir le ferait réapparaître au retour arrière.
    function onPageHide() {
      stop();
    }

    document.addEventListener('click', onClick, { capture: true });
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener(START_EVENT, start);

    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener(START_EVENT, start);
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      if (giveUpRef.current !== undefined) window.clearTimeout(giveUpRef.current);
    };
  }, [start, stop]);

  return <TopProgressBar active={active} />;
}
