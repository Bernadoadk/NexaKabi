'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, BusyOverlay, Button, Textarea } from '@nexakabi/ui';

/**
 * Publier ou refuser.
 *
 * ── Pourquoi le refus demande d'écrire d'abord ───────────────────────────
 * Le champ apparaît AVANT que le bouton de refus devienne actif. Un refus sans
 * motif produit un second événement identique, puis un appel au support :
 * l'organisateur ne sait pas ce qu'on lui reproche. Écrire ce qui ne va pas
 * oblige à savoir ce qui ne va pas.
 *
 * ── Pourquoi un voile plutôt que des boutons désactivés ──────────────────
 * Ces boutons vivent au pied d'une carte, dans une LISTE d'événements à
 * modérer. Les griser pendant la requête dit qu'on ne peut plus cliquer ; ça
 * ne dit pas ce qui est en train de se produire, ni sur lequel des deux gestes
 * — et « Publier » et « Refuser » n'ont pas les mêmes conséquences pour
 * l'organisateur à l'autre bout. Le voile nomme la décision qui part.
 */
export function EventDecision({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [running, setRunning] = React.useState<'APPROVE' | 'REJECT' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const pending = running !== null;

  async function decide(decision: 'APPROVE' | 'REJECT') {
    setRunning(decision);
    setError(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'La décision n’a pas pu être enregistrée.');
        return;
      }

      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
      {/* Le motif est SOUS le voile, pas à côté : continuer à écrire pendant
          que le refus part donnerait l'illusion de pouvoir encore le corriger,
          alors que le texte est déjà chez l'organisateur. */}
      <BusyOverlay
        busy={pending}
        label={running === 'REJECT' ? 'Refus en cours…' : 'Publication…'}
      >
        <div className="flex flex-col gap-3">
          {rejecting ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`note-${eventId}`} className="text-body-s font-semibold">
                Ce qui ne va pas
              </label>
              <Textarea
                id={`note-${eventId}`}
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ex. Le lieu annoncé n’existe pas à cette adresse, et le numéro de contact ne répond pas."
              />
              <p className="text-micro text-text-3">
                L’organisateur ne verra que ce message. Il pourra corriger et resoumettre.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="default"
              onClick={() => void decide('APPROVE')}
            >
              Publier l’événement
            </Button>

            {rejecting ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled={note.trim().length < 10}
                  onClick={() => void decide('REJECT')}
                >
                  Confirmer le refus
                </Button>
                <Button
                  type="button"
                  variant="tertiary"
                  size="default"
                  onClick={() => {
                    setRejecting(false);
                    setNote('');
                  }}
                >
                  Annuler
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="default"
                onClick={() => setRejecting(true)}
              >
                Refuser
              </Button>
            )}
          </div>
        </div>
      </BusyOverlay>

      {error ? (
        <Alert tone="danger" title="Décision non enregistrée">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
