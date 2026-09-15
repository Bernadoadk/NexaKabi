import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Check } from 'lucide-react';
import type { OrganizationAdminSummary } from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../access';
import { AdminShell } from '../shell';

export const metadata: Metadata = { title: 'Organisations' };

const STATUS_FILTERS = [
  ['', 'Toutes'],
  ['VERIFIED', 'Vérifiées'],
  ['PENDING', 'En attente'],
  ['UNVERIFIED', 'Non vérifiées'],
] as const;

/**
 * Écran M7 — organisations de la plateforme.
 *
 * ── Le manque que cet écran comble ────────────────────────────────────────
 * Trois écrans en montraient chacun une tranche — un dossier de vérification,
 * un événement en attente, un signalement — mais aucun ne permettait de les
 * parcourir pour elles-mêmes. Geler un compte n'était possible qu'en passant
 * par un signalement déjà ouvert contre lui.
 */
export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'organizations')) return <AccessDenied user={user} space="organizations" />;

  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.statut) query.set('statut', params.statut);
  if (params.gel) query.set('gel', params.gel);

  const result = await adminFetch<OrganizationAdminSummary[]>(
    `/organizations${query.size > 0 ? `?${query.toString()}` : ''}`,
  );

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Organisations</h1>
          <p className="text-body-s text-text-2">
            Chaque organisation détient un solde : geler ou consulter son historique se fait
            directement ici, sans passer par un signalement.
          </p>
        </header>

        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
          <form className="flex flex-wrap gap-2.5" action="/organisations">
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Rechercher par nom…"
              className="min-h-[var(--tap-min)] flex-1 rounded-field border border-border-field bg-surface px-3 text-body"
            />
            {params.gel === 'true' ? <input type="hidden" name="gel" value="true" /> : null}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map(([value, label]) => (
              <FilterChip
                key={value || 'all'}
                label={label}
                href={buildHref(params, 'statut', value)}
                active={(params.statut ?? '') === value}
              />
            ))}
            <span className="text-text-3">·</span>
            <FilterChip
              label="Retraits gelés"
              href={buildHref(params, 'gel', 'true')}
              active={params.gel === 'true'}
            />
          </div>
        </Surface>

        {!result.ok ? (
          <Alert tone="danger" title="Liste indisponible">
            {result.message}
          </Alert>
        ) : result.data.length === 0 ? (
          <EmptyState
            icon={<Building2 size={26} />}
            title="Aucune organisation ne correspond"
            description="Ajuste la recherche ou les filtres."
          />
        ) : (
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <ul>
              {result.data.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/organisations/${org.id}`}
                    className="flex flex-wrap items-center gap-3 border-t border-border-subtle p-4 text-text-strong transition first:border-t-0 hover:bg-surface-alt"
                  >
                    <div className="min-w-[200px] flex-1">
                      <div className="text-body font-bold">{org.name}</div>
                      <div className="text-micro text-text-3">
                        {org.eventsCount} événement{org.eventsCount > 1 ? 's' : ''} ·{' '}
                        {new Date(org.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>

                    <span className="text-body-s font-semibold tabular-nums">
                      {formatMoney(org.balance)}
                    </span>

                    {org.verificationStatus === 'VERIFIED' ? (
                      <Badge tone="verified">
                        <Check className="size-3" strokeWidth={3} />
                        Vérifiée
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{org.verificationStatus}</Badge>
                    )}

                    {org.payoutFrozen ? <Badge tone="danger">Gelée</Badge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Surface>
        )}
      </div>
    </AdminShell>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-full bg-ink px-3 py-1.5 text-body-s font-semibold text-white'
          : 'rounded-full border border-border-field bg-surface px-3 py-1.5 text-body-s font-semibold text-text-2 hover:bg-paper'
      }
    >
      {label}
    </Link>
  );
}

function buildHref(params: Record<string, string | undefined>, key: string, value: string): string {
  const next = new URLSearchParams();
  for (const [name, current] of Object.entries(params)) {
    if (current && name !== key) next.set(name, current);
  }
  if (params[key] !== value) next.set(key, value);
  const query = next.toString();
  return query ? `/organisations?${query}` : '/organisations';
}
