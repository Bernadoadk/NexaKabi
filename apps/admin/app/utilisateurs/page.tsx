import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { User } from 'lucide-react';
import type { AdminUserSummary } from '@nexakabi/contracts';
import { formatPhoneSafe } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../access';
import { AdminShell } from '../shell';

export const metadata: Metadata = { title: 'Utilisateurs' };

const STATUS_FILTERS = [
  ['', 'Tous'],
  ['ACTIVE', 'Actifs'],
  ['SUSPENDED', 'Suspendus'],
] as const;

/**
 * Écran M9 — comptes de la plateforme.
 *
 * ── Pourquoi une seule liste, acheteurs et organisateurs mélangés ─────────
 * `User` ne distingue pas structurellement les deux : c'est l'appartenance à
 * une organisation qui fait la différence, pas un champ. Avant cet écran, il
 * n'existait tout simplement aucun moyen de chercher un compte pour
 * lui-même — seulement d'en croiser un par un signalement ou une
 * vérification déjà ouverte.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'users')) return <AccessDenied user={user} space="users" />;

  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.statut) query.set('statut', params.statut);

  const result = await adminFetch<AdminUserSummary[]>(
    `/users${query.size > 0 ? `?${query.toString()}` : ''}`,
  );

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Utilisateurs</h1>
          <p className="text-body-s text-text-2">
            Acheteurs et organisateurs confondus — un même compte peut être les deux.
          </p>
        </header>

        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
          <form className="flex flex-wrap gap-2.5" action="/utilisateurs">
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Nom, téléphone ou e-mail…"
              className="min-h-[var(--tap-min)] flex-1 rounded-field border border-border-field bg-surface px-3 text-body"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map(([value, label]) => (
              <FilterChip
                key={value || 'all'}
                label={label}
                href={buildHref(params, value)}
                active={(params.statut ?? '') === value}
              />
            ))}
          </div>
        </Surface>

        {!result.ok ? (
          <Alert tone="danger" title="Liste indisponible">
            {result.message}
          </Alert>
        ) : result.data.length === 0 ? (
          <EmptyState
            icon={<User size={26} />}
            title="Aucun compte ne correspond"
            description="Ajuste la recherche ou les filtres."
          />
        ) : (
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <ul>
              {result.data.map((account) => (
                <li key={account.id}>
                  <Link
                    href={`/utilisateurs/${account.id}`}
                    className="flex flex-wrap items-center gap-3 border-t border-border-subtle p-4 text-text-strong transition first:border-t-0 hover:bg-surface-alt"
                  >
                    <div className="min-w-[200px] flex-1">
                      <div className="text-body font-bold">
                        {account.fullName || formatPhoneSafe(account.phone)}
                      </div>
                      <div className="text-micro text-text-3">
                        {/* Un compte d'équipe n'a pas de vrai numéro : son
                            numéro provisoire n'a rien à faire à l'écran. */}
                        {account.globalRole === 'USER'
                          ? formatPhoneSafe(account.phone)
                          : 'Compte de l’équipe d’administration'}
                        {account.organizationsCount > 0
                          ? ` · ${account.organizationsCount} organisation${account.organizationsCount > 1 ? 's' : ''}`
                          : ''}
                      </div>
                    </div>

                    {account.globalRole !== 'USER' ? (
                      <Badge tone="ink">
                        {account.globalRole === 'OWNER' ? 'Propriétaire' : 'Équipe admin'}
                      </Badge>
                    ) : null}

                    <Badge tone={account.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {account.status === 'ACTIVE' ? 'Actif' : account.status}
                    </Badge>
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

function buildHref(params: Record<string, string | undefined>, statut: string): string {
  const next = new URLSearchParams();
  if (params.q) next.set('q', params.q);
  if (statut) next.set('statut', statut);
  const query = next.toString();
  return query ? `/utilisateurs?${query}` : '/utilisateurs';
}
