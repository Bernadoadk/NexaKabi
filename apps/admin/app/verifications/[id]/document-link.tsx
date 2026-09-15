'use client';

import * as React from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * Ouvre une pièce déposée dans un nouvel onglet, via une URL signée.
 *
 * ── Ce que ce composant corrige ────────────────────────────────────────────
 * L'écran affichait le nom, le type et la taille de chaque pièce, mais
 * aucune façon de l'ouvrir : `StorageProvider.signedUrl()` existait déjà côté
 * API — construit précisément pour ce cas — mais rien ne l'appelait. Un
 * modérateur pouvait voir QU'UNE pièce existait, jamais CE QU'ELLE MONTRAIT —
 * exactement le premier des trois contrôles que cet écran doit permettre.
 *
 * L'URL n'est demandée qu'au clic, jamais préchargée : chaque consultation
 * est tracée nommément côté API, et précharger en dérangerait le compte.
 */
export function DocumentLink({ requestId, documentId }: { requestId: string; documentId: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-micro text-red-700">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);

          try {
            const response = await fetch(
              `/api/admin/verifications/${requestId}/documents/${documentId}/url`,
            );
            const payload = (await response.json()) as { url?: string; message?: string };

            if (!response.ok || !payload.url) {
              setError(payload.message ?? 'Ouverture impossible.');
              return;
            }

            window.open(payload.url, '_blank', 'noopener,noreferrer');
          } catch {
            setError('L’API n’est pas joignable.');
          } finally {
            setPending(false);
          }
        }}
        className="inline-flex items-center gap-1.5 text-body-s font-semibold text-text-strong underline underline-offset-2 hover:text-coral disabled:cursor-progress disabled:opacity-60"
      >
        {pending ? 'Ouverture…' : 'Ouvrir'}
        {!pending ? <ExternalLink className="size-3.5" /> : null}
      </button>
    </div>
  );
}
