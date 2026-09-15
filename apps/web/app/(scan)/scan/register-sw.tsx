'use client';

import * as React from 'react';

/**
 * Enregistrement du service worker du scanner.
 *
 * ── Pourquoi une portée restreinte à `/scan` ────────────────────────────────
 * Un service worker enregistré à la racine intercepterait aussi les pages
 * publiques et l'espace participant, avec une stratégie pensée pour un tout
 * autre usage. La portée `/scan` garantit que la coque du scanner et son cache
 * ne débordent jamais sur le reste du produit.
 *
 * L'échec est silencieux, et c'est voulu : sans service worker, le scanner
 * fonctionne toujours tant qu'il y a du réseau. Afficher une erreur ici
 * inquiéterait un contrôleur qui n'a rien à corriger.
 */
export function RegisterScannerServiceWorker() {
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    void navigator.serviceWorker
      .register('/scanner-sw.js', { scope: '/scan' })
      .catch(() => undefined);
  }, []);

  return null;
}
