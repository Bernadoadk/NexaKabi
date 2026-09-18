'use client';

import * as React from 'react';
import Link from 'next/link';
import { Spinner, cn } from '@nexakabi/ui';
import { sessionHistory, type SyncedScan } from '@/lib/scan/db';
import { drainQueue } from '@/lib/scan/sync';

/**
 * Écran C7 — historique de la session.
 *
 * ── Ce que le contrôleur vient y chercher ───────────────────────────────────
 * « Est-ce que ce que j'ai scanné est bien parti ? » C'est la seule question, et
 * elle mérite une réponse franche : chaque ligne dit si le scan est confirmé par
 * le serveur ou encore en file d'attente.
 *
 * L'historique est LOCAL, pas serveur : il doit s'afficher hors ligne, au
 * moment précis où le contrôleur doute de sa connexion.
 */
export function ScanHistory({ eventId }: { eventId: string }) {
  const [entries, setEntries] = React.useState<SyncedScan[] | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setEntries(await sessionHistory(eventId));
  }, [eventId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function forceSync() {
    setSyncing(true);
    await drainQueue(eventId);
    await refresh();
    setSyncing(false);
  }

  const pending = entries?.filter((entry) => entry.outcome === 'pending').length ?? 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-5 px-5 py-6">
      <header className="flex items-center justify-between gap-3">
        <Link href={`/scan/${eventId}`} className="text-body-s font-semibold text-white/70">
          ← Scanner
        </Link>
        <button
          type="button"
          onClick={() => void forceSync()}
          disabled={syncing || pending === 0}
          className="rounded-chip bg-white/12 px-3 py-2 text-micro font-bold disabled:opacity-40"
        >
          {syncing ? 'Envoi…' : 'Envoyer maintenant'}
        </button>
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-bold tracking-[-0.02em]">Historique</h1>
        {/* La question du contrôleur est « est-ce que mes scans sont bien
            partis ? ». Tant qu'on n'a pas lu la base locale, on ne peut pas y
            répondre — et un « Chargement… » immobile à la place du compte se
            lit comme un zéro. Le point qui tourne dit que la réponse arrive. */}
        <p className="flex items-center gap-2 text-body-s text-white/60">
          {entries === null ? (
            <>
              <Spinner size={13} tone="on-ink" />
              Chargement…
            </>
          ) : (
            `${entries.length} scan${entries.length > 1 ? 's' : ''}${pending > 0 ? ` · ${pending} en attente d’envoi` : ' · tout est synchronisé'}`
          )}
        </p>
      </div>

      {entries !== null && entries.length === 0 ? (
        <p className="rounded-panel border border-white/12 p-5 text-body-s text-white/70">
          Aucun scan pour l’instant. Les entrées enregistrées apparaîtront ici, même sans réseau.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {(entries ?? []).map((entry) => (
          <li
            key={entry.nonce}
            className="flex items-center justify-between gap-3 rounded-card bg-white/[0.07] px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-body font-semibold">{entry.attendeeName}</span>
              <span className="flex items-center gap-2 text-micro text-white/50">
                <span className="tabular">
                  {new Date(entry.scannedAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {entry.ticketSuffix ? (
                  <>
                    <span>·</span>
                    <span className="tabular">{entry.ticketSuffix}</span>
                  </>
                ) : null}
              </span>
            </div>

            <OutcomeBadge outcome={entry.outcome} />
          </li>
        ))}
      </ul>
    </main>
  );
}

/**
 * Issue d'un scan, du point de vue du contrôleur.
 *
 * Un conflit n'est PAS présenté comme une faute : le prototype interdit
 * d'afficher un double scan comme une erreur pendant l'événement, parce que le
 * contrôleur ne peut rien y faire. Il devient « signalé », et l'organisateur
 * l'arbitre après coup.
 */
function OutcomeBadge({ outcome }: { outcome: string }) {
  const style =
    outcome === 'pending'
      ? { label: 'En attente', className: 'bg-amber-400 text-ink' }
      : outcome === 'rejected'
        ? { label: 'Refusé', className: 'bg-red text-white' }
        : outcome === 'conflict'
          ? { label: 'Signalé', className: 'bg-white/20 text-white' }
          : { label: 'Envoyé', className: 'bg-mint text-ink' };

  return (
    <span className={cn('shrink-0 rounded-chip px-2.5 py-1 text-micro font-bold', style.className)}>
      {style.label}
    </span>
  );
}
