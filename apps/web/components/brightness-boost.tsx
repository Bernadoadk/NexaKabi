'use client';

import * as React from 'react';

/**
 * Luminosité forcée sur l'écran du billet.
 *
 * Un QR affiché sur un écran passé en économie de batterie ne se décode pas :
 * le contraste s'effondre bien avant que l'écran ne paraisse sombre à l'œil.
 * Le prototype impose donc de pousser la luminosité pendant l'affichage du
 * billet, puis de la rendre en quittant la page.
 *
 * ── Ce que le web permet réellement ─────────────────────────────────────────
 * Aucune API standard ne règle la luminosité matérielle : `screen.brightness`
 * n'existe pas, et n'existera probablement jamais pour des raisons évidentes
 * d'abus publicitaire. Deux leviers restent, et ce composant les active tous
 * les deux :
 *
 *  · **Wake Lock** empêche l'écran de s'assombrir puis de s'éteindre pendant
 *    que le porteur attend dans la file. C'est le gain le plus tangible.
 *  · **Le thème clair forcé** sur la zone du QR — assuré par le composant
 *    `QrDisplay`, qui impose du noir pur sur du blanc pur quel que soit le
 *    thème du système.
 *
 * Une PWA installée obtiendra davantage. En attendant, mieux vaut ces deux
 * leviers documentés qu'une promesse que le navigateur ne tient pas.
 */
export function BrightnessBoost() {
  React.useEffect(() => {
    // `wakeLock` n'existe pas partout : son absence ne doit rien casser.
    const wakeLock = navigator.wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    void wakeLock
      .request('screen')
      .then((lock) => {
        if (released) {
          void lock.release();
          return;
        }
        sentinel = lock;
      })
      .catch(() => {
        // Refus de l'utilisateur, onglet en arrière-plan, navigateur
        // restrictif : le billet reste parfaitement utilisable sans.
      });

    return () => {
      released = true;
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  return null;
}
