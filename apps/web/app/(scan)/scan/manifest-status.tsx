'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Manifest } from '@nexakabi/contracts';
import { Badge, Button } from '@nexakabi/ui';
import { loadManifest, saveManifest, pendingCount } from '@/lib/scan/db';

type State =
  | { kind: 'checking' }
  | { kind: 'absent' }
  | { kind: 'cached'; entries: number; fetchedAt: number; pending: number }
  | { kind: 'downloading' }
  | { kind: 'error'; message: string };

/**
 * Téléchargement et état du carnet.
 *
 * ── Pourquoi cet écran insiste autant ───────────────────────────────────────
 * Sans carnet, le scanner peut encore vérifier les signatures — mais il ne
 * connaît ni les noms, ni les entrées déjà enregistrées. Le contrôleur laisserait
 * alors passer deux fois le même billet sans le savoir.
 *
 * Le badge « Carnet à jour » du prototype n'est donc pas décoratif : c'est la
 * seule chose qui dit au contrôleur qu'il peut couper le réseau sans risque.
 */
export function ManifestStatus({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({ kind: 'checking' });

  const inspect = React.useCallback(async () => {
    const [stored, pending] = await Promise.all([loadManifest(eventId), pendingCount(eventId)]);

    setState(
      stored
        ? {
            kind: 'cached',
            entries: stored.manifest.entries.length,
            fetchedAt: stored.fetchedAt,
            pending,
          }
        : { kind: 'absent' },
    );
  }, [eventId]);

  React.useEffect(() => {
    void inspect();
  }, [inspect]);

  async function download() {
    setState({ kind: 'downloading' });

    try {
      const stored = await loadManifest(eventId);

      const response = await fetch(`/api/scan/${eventId}/manifest`, {
        // L'`ETag` évite de retélécharger 72 Ko quand rien n'a changé — ce qui
        // compte sur un forfait de données béninois.
        headers: stored ? { 'If-None-Match': `"${stored.manifest.version}"` } : {},
      });

      if (response.status === 304) {
        await inspect();
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setState({
          kind: 'error',
          message: body?.message ?? 'Le carnet n’a pas pu être téléchargé.',
        });
        return;
      }

      await saveManifest((await response.json()) as Manifest);
      await inspect();
    } catch {
      setState({
        kind: 'error',
        message: 'Pas de réseau. Rapproche-toi d’une connexion pour charger le carnet.',
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusLine state={state} />

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          size="primary"
          block
          disabled={state.kind === 'checking' || state.kind === 'absent'}
          loading={state.kind === 'downloading'}
          onClick={() => router.push(`/scan/${eventId}`)}
        >
          Ouvrir le scanner
        </Button>

        <Button
          variant="secondary"
          size="primary"
          block
          loading={state.kind === 'downloading'}
          onClick={() => void download()}
        >
          {state.kind === 'cached' ? 'Mettre à jour le carnet' : 'Télécharger le carnet'}
        </Button>
      </div>

      {state.kind === 'absent' ? (
        <p className="text-center text-micro text-white/50">
          Télécharge le carnet de « {eventTitle} » avant d’entrer dans la salle.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Pastille d'état, sur fond encre.
 *
 * Les tons `success`/`warning`/`danger` du système de design sont pastel,
 * conçus pour un fond clair : sur encre, ils deviennent illisibles. Les
 * variantes `-ink` du composant partagé reprennent les mêmes couleurs de
 * marque avec les contrastes du mode sombre — ce fichier forkait `Badge`
 * localement pour ça avant qu'elles n'existent.
 */
function StatusLine({ state }: { state: State }) {
  if (state.kind === 'error') {
    return <Badge tone="danger-ink">{state.message}</Badge>;
  }

  if (state.kind === 'cached') {
    const minutes = Math.round((Date.now() - state.fetchedAt) / 60_000);

    return (
      <div className="flex flex-col gap-1.5">
        <Badge tone="success-ink">
          Carnet à jour · {state.entries} billet{state.entries > 1 ? 's' : ''}
        </Badge>
        <p className="text-micro text-white/40">
          Chargé il y a {minutes < 1 ? 'moins d’une minute' : `${minutes} min`}
          {state.pending > 0 ? ` · ${state.pending} scan(s) en attente d’envoi` : ''}
        </p>
      </div>
    );
  }

  if (state.kind === 'downloading') {
    return <Badge tone="neutral-ink">Téléchargement du carnet…</Badge>;
  }

  if (state.kind === 'absent') {
    return <Badge tone="warning-ink">Carnet absent</Badge>;
  }

  return <Badge tone="neutral-ink">Vérification…</Badge>;
}
