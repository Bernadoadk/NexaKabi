'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { allChecksPass, type VerificationChecks } from '@nexakabi/contracts';
import { Alert, Button, Surface, Textarea, cn } from '@nexakabi/ui';

/**
 * Décision sur un dossier de vérification.
 *
 * ── Pourquoi trois cases plutôt qu'un bouton « Vérifier » ────────────────
 * Parce qu'un refus doit dire LEQUEL des trois contrôles a échoué. « Dossier
 * incomplet » oblige l'organisateur à tout renvoyer et le modérateur suivant à
 * tout réexaminer ; « le nom sur la pièce ne correspond pas au compte de
 * retrait » se corrige en une fois.
 *
 * ── Pourquoi « Approuver » se désactive tout seul ────────────────────────
 * Cocher trois cases est un geste mécanique ; approuver sans les cocher l'est
 * encore plus. Le bouton ne s'active qu'une fois les trois validés, ce qui
 * oblige à les regarder — c'est tout le rôle de la grille.
 */
export function ReviewForm({
  requestId,
  organizationType,
}: {
  requestId: string;
  organizationType: string;
}) {
  const router = useRouter();

  // Une personne physique n'a jamais de pièce à fournir (voir DOCUMENT_TYPES) :
  // le troisième contrôle n'a rien à évaluer. `legalDocumentValid` reste à
  // `true` dans ce cas — « sans objet » plutôt que « manquant » — pour que le
  // schéma partagé (toujours un booléen) n'ait pas besoin d'un troisième état.
  const requiresDocument = organizationType !== 'INDIVIDUAL';

  const [checks, setChecks] = React.useState<VerificationChecks>({
    idMatchesPayoutAccount: false,
    phoneVerifiedByCode: false,
    legalDocumentValid: !requiresDocument,
  });

  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const canApprove = allChecksPass(checks, { requiresDocument });

  async function submit(decision: 'APPROVE' | 'REJECT' | 'REQUEST_MORE') {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/verifications/${requestId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks, decision, note: note.trim() || undefined }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'La décision n’a pas pu être enregistrée.');
        return;
      }

      router.push('/verifications');
      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-bold">Décision</h2>
        <p className="text-body-s text-text-2">
          {requiresDocument
            ? 'Les trois contrôles, un par un.'
            : 'Personne physique : deux contrôles suffisent, aucune pièce n’est jamais demandée.'}{' '}
          Tout le reste est indicatif.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <CheckRow
          label="Le nom déclaré correspond au compte de retrait"
          hint="« Contact déclaré » / propriétaire, et titulaire du compte de retrait : le même nom."
          checked={checks.idMatchesPayoutAccount}
          onChange={(value) =>
            setChecks((current) => ({ ...current, idMatchesPayoutAccount: value }))
          }
        />
        <CheckRow
          label="Le téléphone est confirmé"
          hint="Numéro joint, ou code de vérification validé."
          checked={checks.phoneVerifiedByCode}
          onChange={(value) => setChecks((current) => ({ ...current, phoneVerifiedByCode: value }))}
        />
        {requiresDocument ? (
          <CheckRow
            label="Le document légal est valide"
            hint="Lisible, non expiré, au nom de l’organisation — jamais une pièce d’identité personnelle."
            checked={checks.legalDocumentValid}
            onChange={(value) =>
              setChecks((current) => ({ ...current, legalDocumentValid: value }))
            }
          />
        ) : (
          <p className="rounded-panel border border-border-subtle bg-surface-alt p-3 text-micro text-text-3">
            Personne physique : aucun document n’est demandé, ce troisième contrôle est sans objet.
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-body-s font-semibold">
          Message à l’organisateur
        </label>
        <Textarea
          id="note"
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ex. La pièce fournie est au nom de Kossi Adjovi, alors que le compte MTN est déclaré au nom de Yélé Productions."
        />
        <p className="text-micro text-text-3">
          Obligatoire dès qu’on n’approuve pas. C’est le seul texte que l’organisateur verra.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="primary"
          size="primary"
          block
          disabled={pending || !canApprove}
          onClick={() => void submit('APPROVE')}
        >
          Approuver et débloquer les retraits
        </Button>

        {!canApprove ? (
          <p className="text-micro text-text-3">
            {requiresDocument
              ? 'Les trois contrôles doivent être validés pour approuver.'
              : 'Les deux contrôles doivent être validés pour approuver.'}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            size="default"
            disabled={pending}
            onClick={() => void submit('REQUEST_MORE')}
          >
            Demander une pièce
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="default"
            disabled={pending}
            onClick={() => void submit('REJECT')}
          >
            Refuser
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title="Décision non enregistrée">
          {error}
        </Alert>
      ) : null}
    </Surface>
  );
}

function CheckRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-panel border p-3 transition',
        checked ? 'border-text-strong bg-surface-alt' : 'border-border hover:border-text-3',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-coral"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-body-s font-semibold leading-snug">{label}</span>
        <span className="text-micro leading-snug text-text-3">{hint}</span>
      </span>
    </label>
  );
}
