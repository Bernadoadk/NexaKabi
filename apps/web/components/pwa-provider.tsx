'use client';

import * as React from 'react';
import { cn } from '@nexakabi/ui';

/**
 * Enregistrement du service worker et invite d'installation.
 *
 * ── Deux règles de retenue ──────────────────────────────────────────────────
 *  · **L'invite n'apparaît pas au premier écran.** Proposer d'installer une
 *    application à quelqu'un qui découvre le site est le meilleur moyen de se
 *    faire refuser — et un refus navigateur ne se redemande pas.
 *  · **Le bandeau hors ligne ne bloque rien.** Il informe. Les billets en cache
 *    restent consultables, et le dire vaut mieux que de le laisser deviner.
 */
export function PwaProvider() {
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Le cache du worker vit dans le NAVIGATEUR, pas dans `.next` : il survit
    // à un redémarrage du serveur de développement. Une page mise en cache
    // AVANT un rebuild ressert alors un format RSC périmé face au nouveau
    // runtime React déjà chargé — une erreur interne illisible plutôt qu'un
    // vrai message. On ne s'enregistre donc qu'en production, où chaque
    // ressource de la coque porte un nom haché et ce décalage ne peut pas se
    // produire (voir l'en-tête du fichier `sw.js`).
    if (process.env.NODE_ENV !== 'production') return;

    // Portée racine, mais le worker ignore lui-même `/scan` : le scanner a sa
    // propre stratégie, incompatible avec celle du participant.
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);

  return (
    <>
      <OfflineBanner />
      <InstallPrompt />
    </>
  );
}

/**
 * Bandeau hors ligne.
 *
 * Discret, en bas, non bloquant. Le prototype l'exige : « on dégrade la
 * fonctionnalité, on ne coupe pas l'accès ».
 */
function OfflineBanner() {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);

    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 bg-amber-400 px-4 py-2.5 text-center text-body-s font-semibold text-ink"
    >
      Hors ligne · tes billets déjà ouverts restent accessibles
    </div>
  );
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Clé de mémorisation du refus. Redemander agace, et n'aboutit pas. */
const DISMISSED_KEY = 'nk_install_dismissed';

/**
 * Invite d'installation.
 *
 * N'apparaît que sur les écrans où elle a du sens — ceux où le participant tient
 * déjà un billet. C'est là que « garder ça sous la main » devient une bonne
 * idée plutôt qu'une interruption.
 */
function InstallPrompt() {
  const [event, setEvent] = React.useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (readDismissed()) return;

    function onPrompt(nativeEvent: Event) {
      // Empêcher l'invite du navigateur pour la déclencher NOUS-MÊMES, au bon
      // moment et avec nos propres mots.
      nativeEvent.preventDefault();
      setEvent(nativeEvent as InstallPromptEvent);

      const path = window.location.pathname;
      setVisible(path.startsWith('/t/') || path.startsWith('/mon-compte'));
    }

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!visible || !event) return null;

  function dismiss() {
    setVisible(false);
    writeDismissed();
  }

  return (
    <div
      className={cn(
        'fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-panel bg-ink p-4 text-white shadow-lg',
        'sm:left-auto sm:right-4 sm:w-[360px]',
      )}
    >
      <div className="flex-1">
        <p className="text-body font-bold">Garde tes billets sous la main</p>
        <p className="mt-0.5 text-body-s text-white/70">
          Installe Nexa-Kabi : tes QR s’ouvrent en un tap, même sans réseau.
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5">
        <button
          type="button"
          onClick={() => {
            void event.prompt();
            void event.userChoice.finally(dismiss);
          }}
          className="min-h-[var(--tap-min)] rounded-button bg-coral px-4 text-body-s font-bold text-ink"
        >
          Installer
        </button>
        <button type="button" onClick={dismiss} className="min-h-8 text-micro text-white/50">
          Plus tard
        </button>
      </div>
    </div>
  );
}

/** Le stockage local peut lever — navigation privée, réglages restrictifs. */
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Sans mémoire du refus, l'invite reviendra à la prochaine visite. C'est
    // regrettable, jamais bloquant.
  }
}
