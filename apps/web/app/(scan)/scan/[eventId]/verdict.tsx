'use client';

import * as React from 'react';
import type { CheckInDecision, VerdictTone } from '@nexakabi/contracts';
import { cn } from '@nexakabi/ui';

/**
 * Écrans C3, C4 et C5 — le verdict.
 *
 * ── Pourquoi le fond entier change de couleur ───────────────────────────────
 * Le prototype est catégorique : « un badge dans un coin ne se lit pas à bout
 * de bras dans la pénombre ». Le contrôleur tient son téléphone à cinquante
 * centimètres, de nuit, avec une file qui pousse. Il doit savoir SANS LIRE.
 *
 * Trois couleurs, trois vibrations, trois comportements :
 *   · vert  — entrée autorisée, retour automatique après 1,5 s, zéro tap ;
 *   · ambre — déjà utilisé, le contrôleur décide, donc l'écran attend ;
 *   · rouge — refusé, l'écran attend aussi : il y a une conversation à avoir.
 */

const TONE_STYLES: Record<VerdictTone, { bg: string; text: string; mark: string }> = {
  green: { bg: 'bg-mint', text: 'text-ink', mark: '✓' },
  amber: { bg: 'bg-amber-400', text: 'text-ink', mark: '!' },
  red: { bg: 'bg-red', text: 'text-white', mark: '✕' },
};

export function Verdict({
  decision,
  onDismiss,
  autoDismissMs,
  firstSeenLabel,
}: {
  decision: CheckInDecision;
  onDismiss: () => void;
  /** Renseigné pour un verdict vert seulement : le reste attend une décision. */
  autoDismissMs?: number;
  firstSeenLabel?: string;
}) {
  const style = TONE_STYLES[decision.tone];

  React.useEffect(() => {
    if (autoDismissMs === undefined) return;

    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        'absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8 text-center',
        style.bg,
        style.text,
      )}
    >
      {/* 104 px : lisible d'un coup d'œil, sans accommoder. */}
      <span className="font-display text-[104px] leading-none" aria-hidden>
        {style.mark}
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-h1 font-bold leading-tight tracking-[-0.02em]">
          {decision.title}
        </h2>

        {decision.entry ? (
          <>
            {/* 19 px : le nom sert à confronter une pièce d'identité. */}
            <p className="text-[19px] font-bold">{decision.entry.n}</p>
            <p className="text-body-s opacity-70">
              {decision.entry.c} · {decision.entry.s}
            </p>
          </>
        ) : null}

        {firstSeenLabel ? (
          <p className="text-body-s font-semibold">
            Première entrée à {firstSeenLabel}
            {decision.firstSeenGate ? ` · ${decision.firstSeenGate}` : ''}
          </p>
        ) : null}

        {decision.instruction ? (
          <p className="mt-1 text-body-s opacity-80">{decision.instruction}</p>
        ) : null}
      </div>

      {/* Un verdict vert se referme seul. Les autres attendent un geste : le
          contrôleur a quelque chose à vérifier ou à expliquer. */}
      {autoDismissMs === undefined ? (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            'min-h-[var(--tap-large)] w-full max-w-[320px] rounded-button text-[15px] font-bold',
            decision.tone === 'red' ? 'bg-white/20 text-white' : 'bg-ink/12 text-ink',
          )}
        >
          Continuer à scanner
        </button>
      ) : null}
    </div>
  );
}
