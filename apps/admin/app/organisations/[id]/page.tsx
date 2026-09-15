import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Check } from 'lucide-react';
import type { ActivityEntry, OrganizationAdminDetail } from '@nexakabi/contracts';
import { formatMoney, formatPhone, formatRelative } from '@nexakabi/utils';
import { Alert, Badge, Stat, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser } from '@/lib/session';
import { AdminShell } from '../../shell';
import { FreezeActions } from './freeze-actions';

export const metadata: Metadata = { title: 'Organisation' };

/** Écran M8 — fiche d'une organisation. */
export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');

  const { id } = await params;

  const [orgResult, auditResult] = await Promise.all([
    adminFetch<OrganizationAdminDetail>(`/organizations/${id}`),
    adminFetch<ActivityEntry[]>(`/organizations/${id}/audit`),
  ]);

  if (!orgResult.ok) {
    if (orgResult.message.includes('n’existe pas')) notFound();

    return (
      <AdminShell user={user}>
        <Alert tone="danger" title="Organisation indisponible">
          {orgResult.message}
        </Alert>
      </AdminShell>
    );
  }

  const org = orgResult.data;
  const audit = auditResult.ok ? auditResult.data : [];

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/organisations"
            className="text-body-s font-semibold text-text-2 hover:text-text-strong"
          >
            ← Organisations
          </Link>
          <span className="text-text-faint">/</span>
          <span className="text-body font-semibold">{org.name}</span>
          <div className="flex-1" />
          {org.verificationStatus === 'VERIFIED' ? (
            <Badge tone="verified">
              <Check className="size-3" strokeWidth={3} />
              Vérifiée
            </Badge>
          ) : (
            <Badge tone="neutral">{org.verificationStatus}</Badge>
          )}
          {org.payoutFrozen ? <Badge tone="danger">Retraits gelés</Badge> : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5">
            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
              <h2 className="text-h3 font-bold">Identité</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Fact label="Type" value={org.type} />
                <Fact label="Ville" value={org.cityName ?? '—'} />
                <Fact label="Raison sociale" value={org.legalName ?? '—'} />
                <Fact
                  label="Créée le"
                  value={new Date(org.createdAt).toLocaleDateString('fr-FR')}
                />
                <Fact label="Propriétaire" value={org.ownerName} emphasis />
                <Fact label="Téléphone" value={formatPhone(org.ownerPhone)} emphasis />
                <Fact label="E-mail" value={org.ownerEmail ?? 'Non renseigné'} />
              </div>
            </Surface>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Stat label="Solde total" amount={org.balance} tone="ink" />
              <Stat label="Événements" value={String(org.eventsCount)} />
              <Stat label="Membres de l’équipe" value={String(org.membersCount)} />
              <Stat label="Événements terminés" value={String(org.completedEventsCount)} />
            </div>

            <Surface variant="panel" padding="none" className="overflow-hidden">
              <div className="border-b border-border-subtle px-5 py-3">
                <h2 className="text-body font-bold">Activité récente</h2>
              </div>

              {audit.length === 0 ? (
                <p className="px-5 py-6 text-center text-body-s text-text-2">
                  Aucune action tracée pour cette organisation.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {audit.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-body-s font-semibold">{entry.summary}</span>
                        <span className="text-micro text-text-3">
                          {entry.actorName ?? 'Système'}
                        </span>
                      </div>
                      <span className="shrink-0 text-micro text-text-3">
                        {formatRelative(new Date(entry.createdAt))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          </div>

          <div className="flex flex-col gap-5 lg:sticky lg:top-[120px] lg:self-start">
            <FreezeActions organizationId={org.id} frozen={org.payoutFrozen} />

            <Surface variant="muted" padding="comfortable" className="flex flex-col gap-1">
              <p className="text-micro text-text-3">Solde en un coup d’œil</p>
              <p className="text-body-s text-text-2">{formatMoney(org.balance)} au total.</p>
            </Surface>
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
