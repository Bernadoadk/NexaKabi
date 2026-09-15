'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { VerificationRequestDetail } from '@nexakabi/contracts';
import { Alert, Badge, Button, Field, Surface, SurfaceHeader, SurfaceTitle } from '@nexakabi/ui';
import { uploadVerificationDocumentAction } from '../actions';

/**
 * Les types du schéma, nommés comme au Bénin — même liste que côté admin.
 *
 * Jamais de pièce d'identité personnelle ici : cette section n'apparaît même
 * plus pour une personne physique (voir `verification/page.tsx`) — seule une
 * organisation qui a une existence légale distincte a un document à fournir.
 */
const DOCUMENT_LABELS: Readonly<Record<string, string>> = {
  RCCM: 'Registre du commerce (RCCM)',
  IFU: 'Identifiant fiscal unique (IFU)',
  ASSOCIATION_STATUTES: 'Statuts de l’association',
  OTHER: 'Autre document de l’organisation',
};

export function DocumentsSection({
  organizationId,
  documents,
}: {
  organizationId: string;
  documents: VerificationRequestDetail['documents'];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <SurfaceHeader>
        <SurfaceTitle>Pièces déposées ({documents.length})</SurfaceTitle>
      </SurfaceHeader>

      {documents.length > 0 ? (
        <ul>
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-body-s font-semibold">
                  {DOCUMENT_LABELS[document.type] ?? document.type}
                </div>
                <div className="text-micro text-text-3">{document.fileName ?? 'Sans nom'}</div>
                {document.status === 'REJECTED' && document.rejectionReason ? (
                  <div className="mt-0.5 text-micro text-red-700">{document.rejectionReason}</div>
                ) : null}
              </div>

              <Badge
                tone={
                  document.status === 'ACCEPTED'
                    ? 'success'
                    : document.status === 'REJECTED'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {document.status === 'PENDING'
                  ? 'En attente'
                  : document.status === 'ACCEPTED'
                    ? 'Acceptée'
                    : 'Refusée'}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-body-s text-text-2">Aucune pièce déposée pour l’instant.</p>
      )}

      <form
        ref={formRef}
        className="flex flex-col gap-3.5 border-t border-border-subtle px-5 py-4"
        action={async (formData) => {
          setPending(true);
          setError(null);

          const result = await uploadVerificationDocumentAction(organizationId, formData);
          setPending(false);

          if (!result.ok) {
            setError(result.message);
            return;
          }

          formRef.current?.reset();
          router.refresh();
        }}
      >
        <p className="eyebrow text-text-3">Déposer une pièce</p>

        {error ? (
          <Alert tone="danger" title="Dépôt impossible">
            {error}
          </Alert>
        ) : null}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Type de pièce" htmlFor="type">
            <select
              id="type"
              name="type"
              defaultValue="RCCM"
              className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-body"
            >
              {Object.entries(DOCUMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fichier" help="JPG, PNG, WebP ou PDF · 8 Mo au maximum" htmlFor="file">
            <input
              id="file"
              name="file"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 py-2 text-body-s"
            />
          </Field>
        </div>

        <Button
          type="submit"
          variant="secondary"
          size="mobile"
          loading={pending}
          loadingLabel="Envoi…"
          className="self-start"
        >
          Déposer la pièce
        </Button>
      </form>
    </Surface>
  );
}
