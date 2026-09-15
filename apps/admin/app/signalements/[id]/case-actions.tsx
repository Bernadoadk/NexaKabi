'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Surface, Textarea } from '@nexakabi/ui';

/**
 * Actions sur un dossier de signalement.
 *
 * ── Pourquoi le gel demande une confirmation explicite ───────────────────
 * Geler immobilise l'argent de quelqu'un qui n'a peut-être rien à se
 * reprocher — un signalement n'est pas une preuve. La mesure est réversible,
 * mais l'organisateur qui ne peut pas payer ses prestataires ce jour-là ne
 * récupère pas la semaine perdue.
 *
 * Le motif est donc obligatoire ET affiché à l'organisateur : écrire pourquoi
 * on gèle oblige à savoir pourquoi on gèle.
 */
export function CaseActions({
  reportId,
  organizationId,
  closed,
  assigned,
}: {
  reportId: string;
  organizationId: string | null;
  closed: boolean;
  assigned: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const [freezeReason, setFreezeReason] = React.useState('');
  const [confirmingFreeze, setConfirmingFreeze] = React.useState(false);

  async function call(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'L’action a échoué.');
        return false;
      }

      router.refresh();
      return true;
    } catch {
      setError('L’API n’est pas joignable.');
      return false;
    } finally {
      setPending(false);
    }
  }

  if (closed) {
    return (
      <Surface variant="panel" padding="comfortable">
        <p className="text-body-s text-text-2">
          Ce dossier est clos. Un gel déjà posé reste actif tant qu’il n’est pas levé depuis la
          fiche de l’organisation.
        </p>
      </Surface>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
        <h2 className="text-h3 font-bold">Instruction</h2>

        {!assigned ? (
          <Button
            type="button"
            variant="secondary"
            size="default"
            block
            disabled={pending}
            onClick={() => void call(`/reports/${reportId}/assign`, {}, 'PATCH')}
          >
            Prendre ce dossier en charge
          </Button>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="note" className="text-body-s font-semibold">
            Ajouter une note interne
          </label>
          <Textarea
            id="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ex. Organisateur joint au 01 97 44 12 08, dit que la salle a changé sans prévenir."
          />
          <Button
            type="button"
            variant="secondary"
            size="default"
            disabled={pending || note.trim().length === 0}
            onClick={async () => {
              if (await call(`/reports/${reportId}/notes`, { body: note })) setNote('');
            }}
          >
            Enregistrer la note
          </Button>
        </div>
      </Surface>

      {organizationId ? (
        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
          <h2 className="text-h3 font-bold">Mesure conservatoire</h2>

          {!confirmingFreeze ? (
            <>
              <p className="text-body-s leading-relaxed text-text-2">
                Le gel empêche tout versement, y compris les fonds qui se débloqueraient plus tard.
                Il est réversible.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="default"
                block
                onClick={() => setConfirmingFreeze(true)}
              >
                Geler les fonds
              </Button>
            </>
          ) : (
            <>
              <Alert tone="warning" title="Cette mesure immobilise de l’argent">
                L’organisateur ne pourra plus rien retirer tant que le gel dure. Le motif ci-dessous
                lui sera visible.
              </Alert>

              <Textarea
                rows={3}
                value={freezeReason}
                onChange={(event) => setFreezeReason(event.target.value)}
                placeholder="Ex. Signalement pour événement inexistant, en cours de vérification auprès de la salle."
              />

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled={pending}
                  onClick={() => {
                    setConfirmingFreeze(false);
                    setFreezeReason('');
                  }}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="default"
                  disabled={pending || freezeReason.trim().length < 10}
                  onClick={async () => {
                    const done = await call(`/organizations/${organizationId}/freeze`, {
                      reason: freezeReason.trim(),
                      reportId,
                    });

                    if (done) {
                      setConfirmingFreeze(false);
                      setFreezeReason('');
                    }
                  }}
                >
                  Confirmer le gel
                </Button>
              </div>
            </>
          )}
        </Surface>
      ) : null}

      <ResolutionForm
        pending={pending}
        onResolve={(decision, resolutionNote) =>
          call(`/reports/${reportId}/resolution`, { decision, note: resolutionNote })
        }
      />

      {error ? (
        <Alert tone="danger" title="Action impossible">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Clôture du dossier.
 *
 * Les deux issues sont côte à côte et de même poids visuel : « traité » et
 * « classé sans suite » sont deux décisions légitimes, et présenter l'une
 * comme le choix par défaut orienterait la modération.
 */
function ResolutionForm({
  pending,
  onResolve,
}: {
  pending: boolean;
  onResolve: (decision: 'RESOLVED' | 'DISMISSED', note: string) => Promise<boolean>;
}) {
  const [note, setNote] = React.useState('');
  const tooShort = note.trim().length < 10;

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
      <h2 className="text-h3 font-bold">Clore le dossier</h2>

      <Textarea
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Ex. Événement confirmé auprès de la salle, le signalant a été rappelé."
      />
      <p className="text-micro text-text-3">
        Dix caractères au minimum. Quelqu’un rouvrira ce dossier dans six mois — peut-être toi.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          size="default"
          disabled={pending || tooShort}
          onClick={() => void onResolve('DISMISSED', note.trim())}
        >
          Classer sans suite
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="default"
          disabled={pending || tooShort}
          onClick={() => void onResolve('RESOLVED', note.trim())}
        >
          Marquer traité
        </Button>
      </div>
    </Surface>
  );
}
