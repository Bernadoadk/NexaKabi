import { FileCheck2, Lock } from 'lucide-react';
import { documentSpec, type VerificationRequestDetail } from '@nexakabi/contracts';
import { Badge, Surface, SurfaceHeader, SurfaceTitle } from '@nexakabi/ui';

/**
 * Ce qui a été déposé — en lecture seule.
 *
 * ── Ce que cette section ne fait plus ─────────────────────────────────────
 * Elle portait le formulaire de dépôt : une liste déroulante de types et un
 * champ fichier, ouverts en permanence à toute organisation qui n'était pas
 * une personne physique. Le dépôt vit désormais dans `RequestedDocuments`, et
 * n'existe que lorsqu'un modérateur a réclamé quelque chose de précis. Ici, on
 * se contente de rendre compte.
 *
 * ── Pourquoi les pièces détruites restent affichées ───────────────────────
 * Parce qu'un organisateur qui a envoyé sa carte d'identité a le droit de
 * savoir ce qu'elle est devenue. « Détruite après décision » est une réponse ;
 * une ligne qui disparaît sans explication n'en est pas une, et c'est celle-là
 * qui produit les appels au support.
 */
export function DocumentsSection({
  documents,
}: {
  documents: VerificationRequestDetail['documents'];
}) {
  if (documents.length === 0) return null;

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <SurfaceHeader>
        <SurfaceTitle>Pièces déposées ({documents.length})</SurfaceTitle>
      </SurfaceHeader>

      <ul>
        {documents.map((document) => {
          const spec = documentSpec(document.type);

          return (
            <li
              key={document.id}
              className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
            >
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-field bg-surface-alt text-text-3"
              >
                {document.available ? <FileCheck2 size={17} /> : <Lock size={16} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-body-s font-semibold">{spec?.label ?? document.type}</div>
                <div className="text-micro text-text-3">
                  {document.available
                    ? (document.fileName ?? 'Sans nom')
                    : 'Fichier détruit après décision — la trace du dépôt est conservée.'}
                </div>
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
          );
        })}
      </ul>
    </Surface>
  );
}
