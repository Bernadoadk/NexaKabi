import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { documentSpec, type DocumentType } from '@nexakabi/contracts';
import { formatPhoneSafe } from '@nexakabi/utils';
import { Alert, Badge, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied, ReadOnlyNotice } from '../../access';
import { AdminShell } from '../../shell';
import { DocumentLink } from './document-link';
import { ReviewForm } from './review-form';

export const metadata: Metadata = { title: 'Dossier de vérification' };

interface VerificationDetail {
  id: string;
  status: string;
  contactName: string;
  contactPhone: string;
  submittedAt: string;
  decisionNote: string | null;
  organization: {
    id: string;
    name: string;
    type: string;
    verificationStatus: string;
    createdAt: string;
    owner: { fullName: string; phone: string; email: string | null };
    payoutAccounts: {
      type: string;
      provider: string | null;
      accountNumber: string;
      accountHolderName: string;
      isDefault: boolean;
    }[];
    _count: { events: number };
  };
  requestedDocuments: DocumentType[];
  documents: {
    id: string;
    type: DocumentType;
    fileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    status: string;
    rejectionReason: string | null;
    consentAt: string | null;
    purgedAt: string | null;
  }[];
}

/**
 * Écran M3 — instruction d'un dossier.
 *
 * ── Ce que l'écran met côte à côte, et pourquoi ──────────────────────────
 * Le nom du titulaire du COMPTE DE RETRAIT et le nom sur les PIÈCES. C'est le
 * premier des trois contrôles, et le plus souvent en défaut : quelqu'un
 * dépose la pièce de son frère, ou déclare un compte Mobile Money ouvert au nom
 * d'un tiers.
 *
 * Les afficher sur deux écrans séparés obligerait à mémoriser un nom entre
 * deux clics — c'est exactement là qu'une vérification devient une formalité.
 */
export default async function VerificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'verifications')) return <AccessDenied user={user} space="verifications" />;
  const canAct = hasAdminAccess(user, 'verifications', 'act');

  const { id } = await params;
  const result = await adminFetch<VerificationDetail>(`/verifications/${id}`);

  if (!result.ok) {
    if (result.message.includes('n’existe pas')) notFound();

    return (
      <AdminShell user={user}>
        <Alert tone="danger" title="Dossier indisponible">
          {result.message}
        </Alert>
      </AdminShell>
    );
  }

  const request = result.data;
  const organization = request.organization;
  const payoutAccount =
    organization.payoutAccounts.find((account) => account.isDefault) ??
    organization.payoutAccounts[0];

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/verifications"
            className="text-body-s font-semibold text-text-2 hover:text-text-strong"
          >
            ← Vérifications
          </Link>
          <span className="text-text-faint">/</span>
          <span className="text-body font-semibold">{organization.name}</span>
          <div className="flex-1" />
          <Badge tone={organization.verificationStatus === 'VERIFIED' ? 'ink' : 'neutral'}>
            {organization.verificationStatus}
          </Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-5">
            {/*
              Le rapprochement décisif : nom déclaré, nom du titulaire du compte
              de retrait, et pièces fournies — dans un seul champ de vision.
            */}
            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
              <h2 className="text-h3 font-bold">À rapprocher</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <Fact label="Contact déclaré" value={request.contactName} />
                <Fact label="Téléphone déclaré" value={formatPhoneSafe(request.contactPhone)} />
                <Fact label="Propriétaire du compte" value={organization.owner.fullName} />
                <Fact
                  label="Téléphone du propriétaire"
                  value={formatPhoneSafe(organization.owner.phone)}
                />
                <Fact
                  label="Titulaire du compte de retrait"
                  value={payoutAccount?.accountHolderName ?? 'Aucun compte déclaré'}
                  emphasis
                />
                <Fact
                  label="Compte de retrait"
                  value={
                    payoutAccount
                      ? `${payoutAccount.provider ?? payoutAccount.type} · ${payoutAccount.accountNumber}`
                      : '—'
                  }
                  emphasis
                />
              </div>

              {!payoutAccount ? (
                <Alert tone="warning" title="Aucun compte de retrait">
                  Le premier contrôle — la concordance entre l’identité et le compte de retrait — ne
                  peut pas être fait. Demande à l’organisateur de déclarer son compte avant de
                  statuer.
                </Alert>
              ) : null}
            </Surface>

            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
              <h2 className="text-h3 font-bold">Pièces fournies ({request.documents.length})</h2>

              {/* Ce qui a été réclamé et n'est pas encore arrivé. Sans ce
                  rappel, le modérateur suivant ne sait pas si le dossier
                  attend l'organisateur ou une décision. */}
              {request.requestedDocuments.length > 0 ? (
                <Alert tone="info" title="En attente de l’organisateur">
                  {request.requestedDocuments
                    .map((type) => documentSpec(type)?.label ?? type)
                    .join(' · ')}
                </Alert>
              ) : null}

              {request.documents.length === 0 ? (
                <p className="text-body-s text-text-2">
                  Aucune pièce déposée. Par défaut, aucune n’est demandée : le rapprochement avec
                  le titulaire du compte de retrait suffit. Utilise « Demander une pièce » si un
                  doute précis l’exige.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {request.documents.map((document) => {
                    const spec = documentSpec(document.type);
                    const purgedAt = document.purgedAt;

                    return (
                      <li
                        key={document.id}
                        className="flex items-center justify-between gap-3 border-b border-border-subtle pb-2 last:border-0"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-body-s font-semibold">
                            {spec?.label ?? document.type}
                          </span>
                          <span className="text-micro text-text-3">
                            {purgedAt
                              ? `Détruite le ${new Date(purgedAt).toLocaleDateString('fr-FR')} — pièce personnelle, après décision`
                              : (document.fileName ?? 'Sans nom')}
                            {!purgedAt && document.sizeBytes
                              ? ` · ${Math.round(document.sizeBytes / 1024)} Ko`
                              : ''}
                            {!purgedAt && document.consentAt ? ' · consentement recueilli' : ''}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <Badge tone={document.status === 'ACCEPTED' ? 'ink' : 'neutral'}>
                            {document.status}
                          </Badge>
                          {canAct && !purgedAt ? (
                            <DocumentLink requestId={request.id} documentId={document.id} />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Les pièces sont stockées en accès privé : leur ouverture passe
                  par une URL signée, à durée limitée, tracée individuellement
                  ci-dessus au moment du clic — jamais préchargée. */}
              <p className="text-micro text-text-3">
                Chaque ouverture d’une pièce est consignée dans le journal d’audit, à ton nom. Les
                pièces personnelles — photo du visage, carte d’identité, passeport — sont détruites
                automatiquement dès que tu approuves ou refuses le dossier.
              </p>
            </Surface>

            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
              <h2 className="text-h3 font-bold">Contexte</h2>

              <div className="grid gap-4 sm:grid-cols-3">
                <Fact label="Type" value={organization.type} />
                <Fact label="Événements publiés" value={String(organization._count.events)} />
                <Fact
                  label="Compte créé le"
                  value={new Date(organization.createdAt).toLocaleDateString('fr-FR')}
                />
              </div>
            </Surface>
          </div>

          <div className="lg:sticky lg:top-[120px] lg:self-start">
            {canAct ? (
              <ReviewForm requestId={request.id} organizationType={organization.type} />
            ) : (
              <ReadOnlyNotice what="statuer sur un dossier ni ouvrir ses pièces" />
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Fact({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-micro text-text-3">{label}</span>
      <span
        className={
          emphasis
            ? 'text-body font-bold text-text-strong'
            : 'text-body-s font-semibold text-text-strong'
        }
      >
        {value}
      </span>
    </div>
  );
}
