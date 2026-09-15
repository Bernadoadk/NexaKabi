import type { Metadata } from 'next';
import Link from 'next/link';
import type { Invitation } from '@nexakabi/contracts';
import { EmptyState, Surface } from '@nexakabi/ui';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/session';
import { AcceptInvitationButton } from './accept-button';

export const metadata: Metadata = { title: 'Invitation' };

/**
 * Acceptation d'une invitation d'équipe.
 *
 * Consultable SANS COMPTE : l'invité découvre l'organisation et le rôle qui lui
 * est proposé avant de se connecter. C'est ce qui rend le lien WhatsApp utile.
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const result = await apiFetch<Invitation>(`/invitations/${token}`);

  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center px-5 py-12">
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <EmptyState
            icon="⏳"
            title="Cette invitation n’est plus valide"
            description={result.error.message}
            secondaryAction={
              <Link href="/" className="text-body-s text-text-2 underline">
                Retour à l’accueil
              </Link>
            }
          />
        </Surface>
      </main>
    );
  }

  const invitation = result.data;
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center gap-6 px-5 py-12">
      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-text-3">Invitation d’équipe</p>
          <h1 className="font-display text-[23px] font-bold tracking-[-0.025em]">
            {invitation.invitedByName} t’invite à rejoindre {invitation.organizationName}
          </h1>
        </div>

        <div className="flex flex-col gap-1.5 rounded-[12px] bg-paper p-4">
          <p className="text-body font-bold">{invitation.roleLabel}</p>
          <p className="text-body-s leading-relaxed text-text-2">{invitation.roleDescription}</p>
        </div>

        {user ? (
          <AcceptInvitationButton
            token={token}
            destination={invitation.role === 'SCANNER' ? '/scan' : '/pro'}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="text-body-s text-text-2">
              Connecte-toi avec ton numéro pour accepter. Aucun mot de passe n’est nécessaire.
            </p>
            <Link
              href={`/connexion?suite=/invitation/${token}`}
              className="flex min-h-[var(--tap-primary)] items-center justify-center rounded-button bg-coral px-6 font-bold text-ink hover:bg-coral-hover"
            >
              Se connecter pour accepter
            </Link>
          </div>
        )}

        <p className="text-micro text-text-3">
          Cette invitation expire le{' '}
          {new Date(invitation.expiresAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
          })}
          . Elle ne peut servir qu’une seule fois.
        </p>
      </Surface>
    </main>
  );
}
