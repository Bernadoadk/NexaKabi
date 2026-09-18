'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ScanFace } from 'lucide-react';
import {
  allChecksPass,
  requestableDocuments,
  type DocumentType,
  type OrganizationType,
  type VerificationChecks,
} from '@nexakabi/contracts';
import { Alert, Button, Dialog, Surface, Textarea, cn, startRouteProgress } from '@nexakabi/ui';

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
  const [asking, setAsking] = React.useState(false);
  const [wanted, setWanted] = React.useState<DocumentType[]>([]);

  const canApprove = allChecksPass(checks, { requiresDocument });

  async function submit(
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_MORE',
    requestedDocuments?: DocumentType[],
  ) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/verifications/${requestId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checks,
          decision,
          note: note.trim() || undefined,
          requestedDocuments,
        }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'La décision n’a pas pu être enregistrée.');
        return;
      }

      // `finally` va relâcher `pending` juste après : sans le filet, le
      // modérateur retrouve un formulaire réactivé sur un dossier déjà tranché
      // et peut le trancher une seconde fois.
      startRouteProgress();
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
            onClick={() => setAsking(true)}
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

      <RequestDocumentsDialog
        open={asking}
        onOpenChange={setAsking}
        organizationType={organizationType as OrganizationType}
        selected={wanted}
        onSelectedChange={setWanted}
        note={note}
        pending={pending}
        onConfirm={() => {
          setAsking(false);
          void submit('REQUEST_MORE', wanted);
        }}
      />
    </Surface>
  );
}

/**
 * Le choix des pièces à réclamer.
 *
 * ── Pourquoi une boîte de dialogue, et pas trois cases de plus dans le
 *    formulaire ────────────────────────────────────────────────────────────
 * Parce que réclamer une pièce d'identité n'est pas un geste ordinaire. C'est
 * la seule action de cette console qui fasse entrer des données personnelles
 * dans le système, et le Code du numérique béninois ne l'autorise que si elle
 * est nécessaire à une finalité déterminée. Une liste toujours visible,
 * cochée machinalement en même temps que le reste, banalise exactement ce
 * qu'il ne faut pas banaliser. S'arrêter, choisir, justifier : c'est le but.
 *
 * ── Pourquoi la liste dépend du statut ───────────────────────────────────
 * Un RCCM n'existe pas pour une personne physique, et les statuts d'une
 * association ne sont demandables par personne — ils révéleraient son objet,
 * donc peut-être une orientation religieuse ou politique. Le catalogue partagé
 * (`requestableDocuments`) tranche, et l'API applique la même règle : ce que
 * cette liste n'affiche pas, elle le refuse aussi.
 */
function RequestDocumentsDialog({
  open,
  onOpenChange,
  organizationType,
  selected,
  onSelectedChange,
  note,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationType: OrganizationType;
  selected: DocumentType[];
  onSelectedChange: (next: DocumentType[]) => void;
  note: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const options = React.useMemo(
    () => requestableDocuments(organizationType),
    [organizationType],
  );

  const noteTooShort = note.trim().length < 10;

  function toggle(type: DocumentType) {
    onSelectedChange(
      selected.includes(type) ? selected.filter((value) => value !== type) : [...selected, type],
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Demander une pièce"
      description="L’organisateur ne pourra déposer que ce qui est coché ici. Tout le reste lui sera refusé."
    >
      <ul className="flex flex-col gap-2">
        {options.map((spec) => {
          const checked = selected.includes(spec.type);

          return (
            <li key={spec.type}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-panel border p-3 transition',
                  checked ? 'border-text-strong bg-surface-alt' : 'border-border hover:border-text-3',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(spec.type)}
                  className="mt-0.5 size-4 shrink-0 accent-coral"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-body-s font-semibold leading-snug">
                    {spec.label}
                    {spec.capture === 'selfie' ? (
                      <ScanFace size={13} className="shrink-0 text-coral" aria-hidden />
                    ) : spec.personal ? (
                      <Lock size={12} className="shrink-0 text-text-3" aria-hidden />
                    ) : null}
                  </span>
                  <span className="text-micro leading-snug text-text-3">{spec.purpose}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {selected.some((type) => options.find((spec) => spec.type === type)?.personal) ? (
        <Alert tone="info" title="Pièce personnelle">
          Ces fichiers sont détruits automatiquement dès que tu approuves ou refuses le dossier.
          Chacune de tes consultations est enregistrée à ton nom.
        </Alert>
      ) : null}

      {noteTooShort ? (
        <Alert tone="warning" title="Le motif manque">
          Ferme cette fenêtre et explique en une phrase ce qui pose problème. C’est le seul texte
          que l’organisateur verra — et c’est aussi ce qui justifie la demande.
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="default" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button
          type="button"
          variant="ink"
          size="default"
          loading={pending}
          disabled={selected.length === 0 || noteTooShort}
          onClick={onConfirm}
        >
          {selected.length === 0
            ? 'Choisis une pièce'
            : `Demander ${selected.length} pièce${selected.length > 1 ? 's' : ''}`}
        </Button>
      </div>
    </Dialog>
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
