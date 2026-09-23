import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import type { PaymentFailures } from '@nexakabi/contracts';
import { Alert, EmptyState, Stat, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { formatShare, toQuery } from '@/lib/finance';
import { AccessDenied } from '../../access';
import { FinancePage, PeriodFilter } from '../finance-page';

export const metadata: Metadata = { title: 'Paiements échoués' };

/**
 * Paiements échoués : pourquoi, sur quel moyen, et ce que ça coûte.
 *
 * ── Un échec n'est pas une vente perdue ─────────────────────────────────────
 * L'acheteur réessaie souvent — un autre numéro, un autre opérateur — et
 * finit par payer. Les ventes rattrapées et les ventes perdues se comptent
 * donc à part : c'est la seconde qui dit s'il y a un problème à régler, et le
 * moyen qui échoue le plus dit où le chercher.
 */
export default async function FailuresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  const params = await searchParams;
  const result = await adminFetch<PaymentFailures>(
    `/finance/failures${toQuery({ du: params.du, au: params.au })}`,
  );

  return (
    <FinancePage
      user={user}
      title="Paiements échoués"
      description="Pourquoi les paiements échouent, sur quel moyen, et combien de ventes sont finalement perdues."
      actions={
        result.ok ? (
          <Link
            href={`/finance/transactions${toQuery({ statut: 'failed', du: result.data.from, au: result.data.to })}`}
            className="inline-flex h-9 items-center rounded-button border border-border-field bg-surface px-3 text-body-s font-semibold text-text-strong hover:bg-paper"
          >
            Voir chaque échec
          </Link>
        ) : null
      }
    >
      {result.ok ? (
        <PeriodFilter path="/finance/echecs" from={result.data.from} to={result.data.to} />
      ) : null}

      {!result.ok ? (
        <Alert tone="danger" title="Chiffres indisponibles">
          {result.message}
        </Alert>
      ) : result.data.failed === 0 ? (
        <EmptyState
          icon={<CircleCheck size={26} />}
          title="Aucun paiement échoué sur cette période"
          description="Les refus des opérateurs, les demandes jamais validées et les abandons apparaîtront ici."
        />
      ) : (
        <FailureReport failures={result.data} />
      )}
    </FinancePage>
  );
}

function FailureReport({ failures }: { failures: PaymentFailures }) {
  const settled = failures.failed + failures.succeeded;
  const topReason = Math.max(1, ...failures.byReason.map((reason) => reason.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Échecs"
          value={String(failures.failed)}
          hint={`sur ${settled} paiements conclus`}
        />
        <Stat
          label="Taux d’échec"
          value={formatShare(failures.failed, settled)}
          tone={failures.failed / Math.max(1, settled) > 0.3 ? 'warning' : 'default'}
          hint="Refus, expirations et abandons"
        />
        <Stat
          label="Ventes rattrapées"
          value={String(failures.recoveredOrders)}
          tone="success"
          hint="L’acheteur a réessayé et payé"
        />
        <Stat
          label="Ventes perdues"
          value={String(failures.lostOrders)}
          tone={failures.lostOrders > 0 ? 'warning' : 'default'}
          hint="Jamais payées après un échec"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-body font-bold">Les causes</h2>
            <p className="text-micro text-text-3">Telles que l’opérateur les a données.</p>
          </div>
          <ul>
            {failures.byReason.map((reason) => (
              <li
                key={reason.code}
                className="flex flex-col gap-1.5 border-t border-border-subtle px-5 py-3 first:border-t-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body-s text-text-strong">{reason.label}</span>
                  <span className="tabular text-body-s font-semibold">{reason.count}</span>
                </div>
                <Bar
                  value={reason.count}
                  peak={topReason}
                  label={`${reason.count} échecs : ${reason.label}`}
                />
              </li>
            ))}
          </ul>
        </Surface>

        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-body font-bold">Par moyen de paiement</h2>
            <p className="text-micro text-text-3">Part des paiements conclus qui ont échoué.</p>
          </div>
          <ul>
            {failures.byMethod.map((method) => (
              <li
                key={method.methodCode}
                className="flex flex-col gap-1.5 border-t border-border-subtle px-5 py-3 first:border-t-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body-s text-text-strong">{method.methodLabel}</span>
                  <span className="tabular text-body-s">
                    <span className="font-semibold">
                      {formatShare(method.failed, method.total)}
                    </span>{' '}
                    <span className="text-text-3">
                      · {method.failed} sur {method.total}
                    </span>
                  </span>
                </div>
                <Bar
                  value={method.failed}
                  peak={method.total}
                  label={`${method.methodLabel} : ${method.failed} échecs sur ${method.total}`}
                />
              </li>
            ))}
          </ul>
        </Surface>
      </div>
    </div>
  );
}

/** Une barre de magnitude, d'une seule teinte ; la valeur est toujours écrite à côté. */
function Bar({ value, peak, label }: { value: number; peak: number; label: string }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-fill-neutral"
      role="img"
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-ink"
        style={{ width: `${Math.round((value / Math.max(1, peak)) * 100)}%` }}
      />
    </div>
  );
}
