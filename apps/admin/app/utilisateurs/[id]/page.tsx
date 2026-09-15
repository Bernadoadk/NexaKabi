import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { AdminUserDetail } from '@nexakabi/contracts';
import { formatPhone } from '@nexakabi/utils';
import { Alert, Badge, Stat, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser } from '@/lib/session';
import { AdminShell } from '../../shell';
import { SuspendActions } from './suspend-actions';

export const metadata: Metadata = { title: 'Compte' };

/** Écran M10 — fiche d'un compte. */
export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) redirect('/connexion');

  const { id } = await params;
  const result = await adminFetch<AdminUserDetail>(`/users/${id}`);

  if (!result.ok) {
    if (result.message.includes('n’existe pas')) notFound();

    return (
      <AdminShell user={admin}>
        <Alert tone="danger" title="Compte indisponible">
          {result.message}
        </Alert>
      </AdminShell>
    );
  }

  const account = result.data;

  return (
    <AdminShell user={admin}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/utilisateurs"
            className="text-body-s font-semibold text-text-2 hover:text-text-strong"
          >
            ← Utilisateurs
          </Link>
          <span className="text-text-faint">/</span>
          <span className="text-body font-semibold">
            {account.fullName || formatPhone(account.phone)}
          </span>
          <div className="flex-1" />
          {account.globalRole !== 'USER' ? <Badge tone="ink">{account.globalRole}</Badge> : null}
          <Badge tone={account.status === 'ACTIVE' ? 'success' : 'danger'}>
            {account.status === 'ACTIVE' ? 'Actif' : account.status}
          </Badge>
        </div>

        {account.status === 'SUSPENDED' && account.suspendedReason ? (
          <Alert tone="warning" title="Compte suspendu">
            {account.suspendedReason}
          </Alert>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5">
            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
              <h2 className="text-h3 font-bold">Coordonnées</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Fact label="Téléphone" value={formatPhone(account.phone)} emphasis />
                <Fact label="E-mail" value={account.email ?? 'Non renseigné'} />
                <Fact
                  label="Compte créé le"
                  value={new Date(account.createdAt).toLocaleDateString('fr-FR')}
                />
                <Fact
                  label="Vu pour la dernière fois"
                  value={
                    account.lastSeenAt
                      ? new Date(account.lastSeenAt).toLocaleDateString('fr-FR')
                      : 'Jamais'
                  }
                />
              </div>
            </Surface>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Stat label="Organisations" value={String(account.organizationsCount)} />
              <Stat label="Commandes" value={String(account.ordersCount)} />
            </div>

            {account.organizations.length > 0 ? (
              <Surface variant="panel" padding="none" className="overflow-hidden">
                <div className="border-b border-border-subtle px-5 py-3">
                  <h2 className="text-body font-bold">Organisations</h2>
                </div>
                <ul>
                  {account.organizations.map((org) => (
                    <li
                      key={org.id}
                      className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0"
                    >
                      <Link
                        href={`/organisations/${org.id}`}
                        className="text-body-s font-semibold hover:text-coral"
                      >
                        {org.name}
                      </Link>
                      <span className="text-micro text-text-3">{org.role}</span>
                    </li>
                  ))}
                </ul>
              </Surface>
            ) : null}
          </div>

          <div className="lg:sticky lg:top-[120px] lg:self-start">
            <SuspendActions
              userId={account.id}
              status={account.status}
              canModerate={account.globalRole === 'USER'}
            />
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
