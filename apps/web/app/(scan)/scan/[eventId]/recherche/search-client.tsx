'use client';

import * as React from 'react';
import Link from 'next/link';
import { searchManifest, type ManifestEntry } from '@nexakabi/contracts';
import { cn } from '@nexakabi/ui';
import {
  enqueueScan,
  isLocallyScanned,
  loadManifest,
  pendingCount,
  type StoredManifest,
} from '@/lib/scan/db';
import { drainQueue } from '@/lib/scan/sync';

/**
 * Écran C6 — recherche manuelle.
 *
 * ── Pourquoi cet écran existe ───────────────────────────────────────────────
 * Un QR déchiré, un écran fissuré, un téléphone à plat, un billet imprimé passé
 * à la machine à laver : à un moment de la soirée, la caméra ne suffira pas. Le
 * prototype impose un secours, et ce secours doit fonctionner HORS LIGNE — il
 * cherche donc dans le carnet local, jamais sur le serveur.
 *
 * ── Deux clés de recherche ──────────────────────────────────────────────────
 * Le nom, tel qu'il est dicté, et les QUATRE DERNIERS caractères de la
 * référence, tels qu'ils se lisent encore sur un écran abîmé. Pas le numéro de
 * téléphone : le carnet ne le transporte pas, et c'est délibéré.
 */
export function ManualSearch({ eventId }: { eventId: string }) {
  const storedRef = React.useRef<StoredManifest | null>(null);

  const [ready, setReady] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<ManifestEntry[]>([]);
  const [admitted, setAdmitted] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(0);

  React.useEffect(() => {
    void (async () => {
      storedRef.current = (await loadManifest(eventId)) ?? null;
      setPending(await pendingCount(eventId));
      setReady(true);
    })();
  }, [eventId]);

  React.useEffect(() => {
    const manifest = storedRef.current?.manifest;
    setResults(manifest ? searchManifest(manifest.entries, query) : []);
  }, [query]);

  async function admit(entry: ManifestEntry) {
    const stored = storedRef.current;
    if (!stored) return;

    if (await isLocallyScanned(eventId, entry.p)) {
      setAdmitted((current) => new Set(current).add(entry.p));
      return;
    }

    await enqueueScan({
      nonce: crypto.randomUUID(),
      eventId,
      ticketPublicId: entry.p,
      // Horloge corrigée, comme pour un scan caméra : les deux chemins doivent
      // produire des horodatages comparables, sinon l'arbitrage des conflits
      // favoriserait l'un des deux sans raison.
      scannedAt: new Date(Date.now() + stored.clockOffsetMs).toISOString(),
      wasOffline: !navigator.onLine,
      overridden: entry.t === 'u',
      // Aucun QR n'a été lu : le billet est identifié depuis le carnet. Le
      // serveur ne peut donc rien vérifier cryptographiquement — il consigne
      // l'entrée au journal d'audit, au nom de ce contrôleur.
      manualEntry: true,
      attendeeName: entry.n,
      ticketSuffix: entry.s,
      attempts: 0,
      createdAt: Date.now(),
    });

    setAdmitted((current) => new Set(current).add(entry.p));
    setPending(await pendingCount(eventId));

    if (navigator.onLine) {
      void drainQueue(eventId).then((report) => setPending(report.remaining));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-5 px-5 py-6">
      <header className="flex items-center justify-between gap-3">
        <Link href={`/scan/${eventId}`} className="text-body-s font-semibold text-white/70">
          ← Scanner
        </Link>
        {pending > 0 ? (
          <span className="rounded-chip bg-amber-400 px-2.5 py-1 text-micro font-bold text-ink">
            {pending} en attente
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h2 font-bold tracking-[-0.02em]">Recherche manuelle</h1>
        <p className="text-body-s text-white/60">
          Cherche par nom, ou par les 4 derniers caractères de la référence.
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Nom, ou 4 derniers caractères"
        autoFocus
        // `inputMode` par défaut : le contrôleur tape autant des lettres que
        // des chiffres, et forcer un pavé numérique le bloquerait.
        className="min-h-[var(--tap-primary)] w-full rounded-field border border-white/20 bg-white/[0.07] px-4 text-[16px] text-white placeholder:text-white/35 focus:border-white/50 focus:outline-none"
      />

      {!ready ? <p className="text-body-s text-white/50">Chargement du carnet…</p> : null}

      {ready && !storedRef.current ? (
        <p className="rounded-panel border border-white/12 p-5 text-body-s text-white/70">
          Aucun carnet en mémoire. Reviens à la liste des événements et télécharge-le pendant que tu
          as du réseau.
        </p>
      ) : null}

      {ready && storedRef.current && query.trim().length < 2 ? (
        <p className="text-body-s text-white/50">Saisis au moins deux caractères.</p>
      ) : null}

      {ready && query.trim().length >= 2 && results.length === 0 ? (
        <p className="rounded-panel border border-white/12 p-5 text-body-s text-white/70">
          Aucun billet ne correspond. Vérifie l’orthographe, ou demande la référence complète.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {results.map((entry) => (
          <ResultRow
            key={entry.p}
            entry={entry}
            admitted={admitted.has(entry.p)}
            onAdmit={() => void admit(entry)}
          />
        ))}
      </ul>
    </main>
  );
}

function ResultRow({
  entry,
  admitted,
  onAdmit,
}: {
  entry: ManifestEntry;
  admitted: boolean;
  onAdmit: () => void;
}) {
  const cancelled = entry.t === 'x';
  const used = entry.t === 'u';

  return (
    <li className="flex items-center justify-between gap-3 rounded-card bg-white/[0.07] px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body font-bold">{entry.n}</span>
        <span className="flex items-center gap-2 text-micro text-white/50">
          <span className="tabular">{entry.s}</span>
          <span>·</span>
          <span className="truncate">{entry.c}</span>
        </span>
      </div>

      {cancelled ? (
        <span className="shrink-0 rounded-chip bg-red px-2.5 py-1 text-micro font-bold text-white">
          Annulé
        </span>
      ) : (
        <button
          type="button"
          onClick={onAdmit}
          disabled={admitted}
          className={cn(
            'min-h-[var(--tap-min)] shrink-0 rounded-button px-4 text-body-s font-bold transition',
            admitted && 'bg-mint text-ink',
            // Un billet déjà entré reste validable : le contrôleur peut avoir
            // une bonne raison. Le bouton l'annonce, il ne l'empêche pas.
            !admitted && used && 'bg-amber-400 text-ink',
            !admitted && !used && 'bg-white text-ink',
          )}
        >
          {admitted ? 'Entré ✓' : used ? 'Déjà entré · forcer' : 'Faire entrer'}
        </button>
      )}
    </li>
  );
}
