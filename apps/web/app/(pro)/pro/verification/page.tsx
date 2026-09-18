import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { VerificationRequestDetail } from '@nexakabi/contracts';
import { Alert, Badge, Surface } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { orgFetch, resolveActiveOrganization } from '@/lib/organizations';
import { ContactForm } from './contact-form';
import { DocumentsSection } from './documents-section';
import { VerificationDocuments } from './verification-documents';

export const metadata: Metadata = { title: 'Vérification d’identité' };

/**
 * Vérification d'identité — écran qui n'existait pas.
 *
 * ── Ce que ce chantier corrige ─────────────────────────────────────────────
 * L'écran de revue admin (`verifications/[id]`) fonctionnait déjà, et le
 * dossier lui-même (`VerificationRequest`) était entièrement modélisé — mais
 * rien, côté organisateur, ne pouvait jamais en créer un dans le produit qui
 * tourne : la seule ligne de code qui appelait `verificationRequest.create`
 * était un script de peuplement de démonstration.
 */
export default async function VerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?suite=/pro/verification');

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  if (active.verificationStatus === 'VERIFIED') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-h1 font-bold">Vérification d’identité</h1>
        <Alert tone="success" title="Organisation vérifiée">
          Tes retraits sont débloqués. Rien d’autre à faire ici.
        </Alert>
      </div>
    );
  }

  const result = await orgFetch<VerificationRequestDetail | null>(
    active.id,
    '/organizer/organizations/current/verification',
  );
  const request = result.ok ? result.data : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1 font-bold">Vérification d’identité</h1>
        {request ? <StatusBadge status={request.status} /> : null}
      </div>

      <p className="text-body-l text-text-2">
        {active.type === 'INDIVIDUAL'
          ? 'Deux contrôles suffisent : le nom que tu as déclaré correspond au titulaire du compte ' +
            'de retrait, et ton numéro est confirmé. Tu peux publier et vendre sans être vérifié — ' +
            'c’est le retrait de tes fonds qui reste bloqué jusque-là.'
          : 'Trois contrôles suffisent : le nom déclaré correspond au titulaire du compte de ' +
            'retrait, ton numéro est confirmé, et l’organisation existe légalement. Tu peux ' +
            'publier et vendre sans être vérifié — c’est le retrait de tes fonds qui reste bloqué ' +
            'jusque-là.'}
      </p>

      {/* Dit d'emblée, et pas seulement au moment où une pièce est réclamée :
          savoir qu'on ne demandera rien sans raison est ce qui rend acceptable
          qu'on demande, le jour où c'est nécessaire. */}
      <p className="text-body-s text-text-3">
        Aucune pièce d’identité n’est demandée par défaut. Si un doute précis apparaît sur ton
        dossier, un modérateur te dira lequel et quelle pièce il lui faut — elle sera détruite dès
        la décision rendue.
      </p>

      {request?.status === 'REJECTED' && request.decisionNote ? (
        <Alert tone="danger" title="Dossier refusé">
          {request.decisionNote} Corrige ce qui est nécessaire et soumets à nouveau.
        </Alert>
      ) : null}

      {request?.status === 'INCOMPLETE' && request.decisionNote ? (
        <Alert tone="warning" title="Il manque quelque chose">
          {request.decisionNote}
        </Alert>
      ) : null}

      {/* Deux régimes : une pièce personnelle sur demande motivée seulement,
          un document d'entité librement. Le composant se rend vide quand ni
          l'un ni l'autre n'a lieu d'être — voir sa documentation. */}
      {request ? (
        <VerificationDocuments request={request} organizationType={active.type} />
      ) : null}

      {request?.status === 'PENDING' ? (
        <Alert tone="info" title="Dossier en cours d’instruction">
          Déposé le {new Date(request.submittedAt).toLocaleDateString('fr-FR')}. Une équipe
          l’examine sous 2 heures ouvrées.
        </Alert>
      ) : null}

      <Surface variant="panel" padding="comfortable">
        <ContactForm
          organizationId={active.id}
          initial={
            request
              ? { contactName: request.contactName, contactPhone: request.contactPhone }
              : null
          }
        />
      </Surface>

      {request ? <DocumentsSection documents={request.documents} /> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: VerificationRequestDetail['status'] }) {
  const map: Record<
    VerificationRequestDetail['status'],
    { tone: 'warning' | 'danger' | 'neutral' | 'verified'; label: string }
  > = {
    UNVERIFIED: { tone: 'neutral', label: 'Non soumis' },
    PENDING: { tone: 'warning', label: 'En attente' },
    INCOMPLETE: { tone: 'warning', label: 'À compléter' },
    REJECTED: { tone: 'danger', label: 'Refusé' },
    VERIFIED: { tone: 'verified', label: 'Vérifié' },
  };

  const { tone, label } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}
