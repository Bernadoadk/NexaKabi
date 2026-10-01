'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { applyAppBadge, syncThisDevice } from '@/lib/push-client';

/** Deux rafraîchissements de suite n'apprennent rien : une rafale en provoque un seul. */
const REFRESH_COOLDOWN_MS = 4_000;

/**
 * Ce qui fait vivre les notifications d'une personne connectée, sans rien afficher.
 *
 * ── Trois gestes, un seul composant ─────────────────────────────────────────
 *  1. **Remettre l'appareil en règle.** La déconnexion désabonne l'appareil ; à la
 *     connexion suivante, ceci le réabonne seul — si la personne l'avait autorisé
 *     et ne l'a pas coupé. Une application installée ne demande pas deux fois.
 *  2. **La pastille de l'icône.** Le compteur de non lues, tel que le serveur l'a
 *     rendu à cette page, se pose sur l'icône de l'application installée.
 *  3. **Se mettre à jour en direct.** Quand une notification arrive pendant que
 *     l'application est ouverte, le service worker le dit à la page : le compteur
 *     et la liste se rafraîchissent d'eux-mêmes, sans qu'on recharge.
 *
 * Monté dans les espaces CONNECTÉS seulement (participant, organisateur, et
 * l'espace public d'une session ouverte) : ni le tunnel d'achat ni le scanner,
 * où un rafraîchissement en cours de saisie serait pire que la notification
 * qu'il annonce.
 */
export function PushSync({ userId, unreadCount }: { userId: string; unreadCount: number }) {
  const router = useRouter();

  React.useEffect(() => {
    void syncThisDevice(userId).catch(() => undefined);
  }, [userId]);

  React.useEffect(() => {
    void applyAppBadge(unreadCount);
  }, [unreadCount]);

  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let lastRefresh = 0;

    function onMessage(event: MessageEvent) {
      const message = event.data as { type?: unknown; unread?: unknown } | null;
      if (message?.type !== 'nk:push') return;

      if (typeof message.unread === 'number') void applyAppBadge(message.unread);

      const now = Date.now();
      if (now - lastRefresh < REFRESH_COOLDOWN_MS) return;
      lastRefresh = now;

      router.refresh();
    }

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return null;
}
