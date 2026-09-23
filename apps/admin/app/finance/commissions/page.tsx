import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  COMMISSION_SCOPE_LABELS,
  DEFAULT_COMMISSION_POLICY,
  KNOWN_COUNTRIES,
  type AdminCommissionPolicy,
} from '@nexakabi/contracts';
import { formatEventCaption } from '@nexakabi/utils';
import { Alert, Badge, Surface } from '@nexakabi/ui';
import { adminFetch, canMoveMoney, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied, ReadOnlyNotice } from '../../access';
import { FinancePage } from '../finance-page';
import { CloseButton } from './close-button';
import { describeCommission, describePayout, type PolicyRates } from './describe';
import { NewPolicyForm } from './new-policy-form';

export const metadata: Metadata = { title: 'Commissions' };

const COUNTRY_NAMES = new Map(KNOWN_COUNTRIES.map((country) => [country.code, country.name]));

/**
 * Commissions : ce que chaque vente rapporte à la plateforme.
 *
 * ── Version après version ───────────────────────────────────────────────────
 * Une politique ne se modifie jamais : chaque commande garde celle qui l'a
 * tarifée. Changer une commission publie une nouvelle version, qui ferme la
 * précédente de même portée. L'historique reste donc lisible — combien de
 * ventes chaque version a tarifées, et quand.
 *
 * La plus spécifique l'emporte : organisation, puis pays, puis plateforme.
 */
export default async function CommissionsPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  // Décider de ce que rapporte chaque vente, c'est décider d'argent.
  const allowed = hasAdminAccess(user, 'finance', 'act') && canMoveMoney(user);

  const [policies, organizations] = await Promise.all([
    adminFetch<AdminCommissionPolicy[]>('/finance/commissions'),
    adminFetch<{ id: string; name: string }[]>('/finance/organizations'),
  ]);

  const platform = policies.ok
    ? policies.data.find((policy) => policy.scope === 'PLATFORM' && policy.current)
    : undefined;

  const base: PolicyRates = platform ?? {
    ...DEFAULT_COMMISSION_POLICY,
    minFeePerOrder: DEFAULT_COMMISSION_POLICY.minFeePerOrder ?? null,
    maxFeePerOrder: DEFAULT_COMMISSION_POLICY.maxFeePerOrder ?? null,
  };

  const current = policies.ok ? policies.data.filter((policy) => policy.current) : [];
  const history = policies.ok ? policies.data.filter((policy) => !policy.current) : [];

  return (
    <FinancePage
      user={user}
      title="Commissions"
      description="Ce que chaque vente rapporte à Nexa-Kabi. La plus spécifique l’emporte : organisation, puis pays, puis plateforme."
    >
      {allowed ? (
        <NewPolicyForm base={base} organizations={organizations.ok ? organizations.data : []} />
      ) : (
        <ReadOnlyNotice what="changer une commission" />
      )}

      {!policies.ok ? (
        <Alert tone="danger" title="Commissions indisponibles">
          {policies.message}
        </Alert>
      ) : (
        <>
          {!platform ? (
            <Alert tone="warning" title="Aucune politique de plateforme en vigueur">
              Les ventes appliquent la constante de repli du code : {describeCommission(base)}.
              Publie une version pour la plateforme afin que ce choix soit écrit.
            </Alert>
          ) : null}

          <PolicyList title="En vigueur" policies={current} allowed={allowed} />
          {history.length > 0 ? (
            <PolicyList title="Versions closes" policies={history} allowed={false} />
          ) : null}
        </>
      )}
    </FinancePage>
  );
}

function PolicyList({
  title,
  policies,
  allowed,
}: {
  title: string;
  policies: AdminCommissionPolicy[];
  allowed: boolean;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">{title}</h2>
      {policies.length === 0 ? (
        <p className="text-body-s text-text-2">Aucune.</p>
      ) : (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <ul>
            {policies.map((policy) => (
              <li
                key={policy.id}
                className="flex flex-wrap items-start gap-3 border-t border-border-subtle px-5 py-4 first:border-t-0"
              >
                <div className="min-w-[240px] flex-1">
                  <div className="text-body-s font-bold text-text-strong">{policy.name}</div>
                  <div className="text-micro font-semibold text-text-2">{scopeOf(policy)}</div>
                  <div className="mt-1 text-body-s text-text-2">{describeCommission(policy)}</div>
                  <div className="text-micro text-text-3">{describePayout(policy)}</div>
                  <div className="text-micro text-text-3">
                    {policy.validTo
                      ? `Du ${formatEventCaption(new Date(policy.validFrom))} au ${formatEventCaption(new Date(policy.validTo))}`
                      : `Depuis le ${formatEventCaption(new Date(policy.validFrom))}`}{' '}
                    · {policy.ordersCount} commande{policy.ordersCount > 1 ? 's' : ''} tarifée
                    {policy.ordersCount > 1 ? 's' : ''}
                  </div>
                </div>
                <Badge tone={policy.current ? 'success' : 'neutral'}>
                  {policy.current ? 'En vigueur' : 'Close'}
                </Badge>
                {allowed && policy.current && policy.scope !== 'PLATFORM' ? (
                  <CloseButton policyId={policy.id} />
                ) : null}
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </section>
  );
}

function scopeOf(policy: AdminCommissionPolicy): string {
  if (policy.scope === 'ORGANIZATION') return `Organisation · ${policy.organizationName ?? '—'}`;
  if (policy.scope === 'COUNTRY') {
    return `Pays · ${COUNTRY_NAMES.get(policy.countryCode ?? '') ?? policy.countryCode}`;
  }
  return COMMISSION_SCOPE_LABELS.PLATFORM;
}
