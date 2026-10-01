'use client';

import * as React from 'react';
import { BellRing, Check } from 'lucide-react';
import { Button, Surface, cn } from '@nexakabi/ui';
import { currentPushSubscription, detectPushSupport, subscribeThisDevice } from '@/lib/push-client';

/** Clé du « plus tard » : l'invitation ne revient pas avant quatorze jours. */
const DISMISSED_KEY = 'nk_push_prompt_dismissed';
const DISMISSED_FOR_MS = 14 * 24 * 60 * 60 * 1000;

export type EnablePushVariant = 'tickets' | 'organizer';

const COPY: Readonly<Record<EnablePushVariant, { title: string; body: string }>> = {
  tickets: {
    title: 'Ne rate rien de ton événement',
    body: 'Reçois ton billet, les rappels et les changements de dernière minute sur cet appareil, même application fermée.',
  },
  organizer: {
    title: 'Vois tes ventes en direct',
    body: 'Une notification à chaque vente, même application fermée. Tu règles ce que tu reçois depuis tes alertes.',
  },
};

type State =
  'checking' | 'hidden' | 'ask' | 'install-first' | 'busy' | 'done' | 'refused' | 'error';

/**
 * Invitation à activer les notifications, au moment où elles ont du sens.
 *
 * ── Pourquoi une carte à nous avant la question du navigateur ───────────────
 * Le navigateur ne pose sa question qu'une fois : un refus ne se redemande pas,
 * il se corrige dans les réglages du site, là où presque personne ne va. Poser
 * cette question à froid, au chargement d'une page, est le meilleur moyen de se
 * la faire refuser. Cette carte explique d'abord ce qu'on y gagne, à l'instant
 * où l'on vient d'acheter un billet ou d'ouvrir ses ventes — et ne déclenche la
 * vraie question qu'au toucher de son bouton.
 *
 * ── Quand elle se tait ─────────────────────────────────────────────────────
 * Navigateur sans notifications ; autorisation déjà donnée (c'est `PushSync` qui
 * abonne alors l'appareil, sans rien demander) ou refusée (rien à proposer) ;
 * invitation écartée depuis moins de quatorze jours ; push absent du serveur.
 *
 * Sur iPhone, Safari n'offre le push qu'à une application ajoutée à l'écran
 * d'accueil : la carte le dit plutôt que de promettre ce qui ne marchera pas.
 */
export function EnablePushCard({
  variant,
  publicKey,
  tone = 'light',
  className,
}: {
  variant: EnablePushVariant;
  /** Clé VAPID du serveur, ou `null` si le push n'y est pas configuré. */
  publicKey: string | null;
  /** `dark` : posée sur un fond encre, comme l'écran de confirmation. */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const [state, setState] = React.useState<State>('checking');

  React.useEffect(() => {
    if (!publicKey || dismissedRecently()) {
      setState('hidden');
      return;
    }

    const support = detectPushSupport();

    if (support === 'unsupported') {
      setState('hidden');
      return;
    }

    if (support === 'install-first') {
      setState('install-first');
      return;
    }

    // Déjà autorisé : `PushSync` s'en charge. Refusé : rien à proposer.
    if (Notification.permission !== 'default') {
      setState('hidden');
      return;
    }

    void currentPushSubscription()
      .then((subscription) => setState(subscription ? 'hidden' : 'ask'))
      .catch(() => setState('ask'));
  }, [publicKey]);

  if (state === 'checking' || state === 'hidden' || !publicKey) return null;

  async function enable() {
    if (!publicKey) return;
    setState('busy');

    try {
      const outcome = await subscribeThisDevice(publicKey);

      if (outcome === 'subscribed') setState('done');
      else if (outcome === 'denied') setState('refused');
      // Fermée sans choisir : l'invitation reste là, la question pourra être reposée.
      else if (outcome === 'dismissed') setState('ask');
      else setState('error');
    } catch {
      setState('error');
    }
  }

  function dismiss() {
    writeDismissed();
    setState('hidden');
  }

  const dark = tone === 'dark';
  const copy = COPY[variant];

  const content =
    state === 'done' ? (
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-mint text-ink"
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
        <p role="status" className={cn('text-body-s font-semibold', dark && 'text-white')}>
          Notifications activées sur cet appareil.
        </p>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px]',
              dark ? 'bg-white/10 text-mint' : 'bg-coral-50 text-coral-700',
            )}
          >
            <BellRing className="size-[18px]" />
          </span>

          <div className="flex min-w-0 flex-col gap-0.5">
            <p className={cn('text-body font-bold', dark && 'text-white')}>{copy.title}</p>
            <p className={cn('text-body-s', dark ? 'text-white/70' : 'text-text-2')}>
              {state === 'install-first'
                ? 'Sur iPhone, ajoute d’abord Nexa‑Kabi à l’écran d’accueil (Partager → Sur l’écran d’accueil), puis reviens ici pour activer les notifications.'
                : copy.body}
            </p>
            {state === 'refused' ? (
              <p
                role="alert"
                className={cn('mt-1 text-micro', dark ? 'text-white/70' : 'text-text-3')}
              >
                Tu as refusé : tu pourras les activer plus tard dans les réglages du site de ton
                navigateur.
              </p>
            ) : null}
            {state === 'error' ? (
              <p role="alert" className="mt-1 text-micro font-semibold text-red-700">
                Les notifications n’ont pas pu être activées. Réessaie dans un instant.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end">
          <button
            type="button"
            onClick={dismiss}
            className={cn(
              'min-h-[var(--tap-min)] px-3 text-body-s font-semibold transition',
              dark ? 'text-white/60 hover:text-white' : 'text-text-3 hover:text-text-strong',
            )}
          >
            {state === 'refused' || state === 'install-first' ? 'Fermer' : 'Plus tard'}
          </button>

          {state === 'ask' || state === 'busy' || state === 'error' ? (
            <Button
              variant="primary"
              size="compact"
              loading={state === 'busy'}
              loadingLabel="Activation…"
              onClick={() => void enable()}
            >
              Activer les notifications
            </Button>
          ) : null}
        </div>
      </div>
    );

  if (dark) {
    return (
      <section
        aria-label="Notifications"
        className={cn('rounded-panel border border-white/10 bg-white/5 p-4', className)}
      >
        {content}
      </section>
    );
  }

  return (
    <Surface
      variant="panel"
      padding="comfortable"
      role="region"
      aria-label="Notifications"
      className={className}
    >
      {content}
    </Surface>
  );
}

/** Le stockage local peut lever — navigation privée, réglages restrictifs. */
function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISSED_FOR_MS;
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Sans mémoire du « plus tard », la carte reviendra à la prochaine visite.
    // C'est regrettable, jamais bloquant.
  }
}
