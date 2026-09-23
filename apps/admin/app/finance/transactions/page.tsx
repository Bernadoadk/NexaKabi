import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Receipt } from 'lucide-react';
import {
  PAYMENT_METHOD_DEFINITIONS,
  type AdminPaymentPage,
  type PaymentStatusGroup,
} from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, EmptyState, Money, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { toQuery } from '@/lib/finance';
import { AccessDenied } from '../../access';
import { PaymentStatusBadge } from '../badges';
import { ExportLink, FinancePage, Pager } from '../finance-page';

export const metadata: Metadata = { title: 'Transactions' };

const STATUS_OPTIONS: readonly [PaymentStatusGroup | '', string][] = [
  ['', 'Tous les états'],
  ['succeeded', 'Réussis'],
  ['failed', 'Échoués'],
  ['pending', 'En attente'],
];

const FIELD =
  'h-9 rounded-field border border-border-field bg-surface px-2.5 text-body-s text-text-strong';

/**
 * Transactions : chaque paiement, réussi ou non.
 *
 * L'écran qui répond à « un acheteur dit avoir payé » : on retrouve son
 * paiement par la référence de commande, celle du prestataire, ou la fin de
 * son numéro, et le détail dit tout ce qui lui est arrivé.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  const params = await searchParams;
  const filters = {
    q: params.q,
    statut: params.statut,
    moyen: params.moyen,
    du: params.du,
    au: params.au,
  };

  const result = await adminFetch<AdminPaymentPage>(
    `/finance/payments${toQuery({ ...filters, page: params.page })}`,
  );

  return (
    <FinancePage
      user={user}
      title="Transactions"
      description="Chaque paiement, réussi ou non. Le numéro du payeur reste masqué : il ne sert à rien pour lire une transaction."
      actions={
        <ExportLink href={`/api/admin/finance/payments.csv${toQuery(filters)}`}>
          Exporter en CSV
        </ExportLink>
      }
    >
      <form method="get" action="/finance/transactions" className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-micro font-semibold text-text-2">
          Recherche
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="NK-8F4C21, référence opérateur, fin de numéro, nom"
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-micro font-semibold text-text-2">
          État
          <select name="statut" defaultValue={params.statut ?? ''} className={FIELD}>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value || 'all'} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-micro font-semibold text-text-2">
          Moyen
          <select name="moyen" defaultValue={params.moyen ?? ''} className={FIELD}>
            <option value="">Tous les moyens</option>
            {PAYMENT_METHOD_DEFINITIONS.map((method) => (
              <option key={method.code} value={method.code}>
                {method.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-micro font-semibold text-text-2">
          Du
          <input type="date" name="du" defaultValue={params.du} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-micro font-semibold text-text-2">
          Au
          <input type="date" name="au" defaultValue={params.au} className={FIELD} />
        </label>
        <button
          type="submit"
          className="h-9 rounded-button bg-ink px-3 text-body-s font-semibold text-white"
        >
          Filtrer
        </button>
        {Object.values(filters).some(Boolean) ? (
          <Link
            href="/finance/transactions"
            className="flex h-9 items-center px-2 text-body-s font-semibold text-text-2 hover:text-text-strong"
          >
            Effacer
          </Link>
        ) : null}
      </form>

      {!result.ok ? (
        <Alert tone="danger" title="Liste indisponible">
          {result.message}
        </Alert>
      ) : result.data.items.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} />}
          title="Aucun paiement ne correspond"
          description="Élargis la période ou retire un filtre."
        />
      ) : (
        <>
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <ul>
              {result.data.items.map((payment) => (
                <li key={payment.id} className="border-t border-border-subtle first:border-t-0">
                  <Link
                    href={`/finance/transactions/${payment.id}`}
                    className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-alt"
                  >
                    <div className="min-w-[220px] flex-1">
                      <div className="text-body font-bold text-text-strong">
                        <span className="tabular">{payment.orderReference}</span> ·{' '}
                        {payment.buyerName}
                      </div>
                      <div className="text-micro text-text-3">
                        {payment.eventTitle} · {payment.organizationName}
                      </div>
                      <div className="text-micro text-text-3">
                        {payment.methodLabel} · {payment.providerLabel}
                        {payment.payerPhone ? (
                          <>
                            {' '}
                            · <span className="tabular">{payment.payerPhone}</span>
                          </>
                        ) : null}{' '}
                        · {formatEventCaptionWithTime(new Date(payment.createdAt))}
                      </div>
                      {payment.failureReason ? (
                        <div className="mt-0.5 text-micro text-red-700">
                          {payment.failureReason}
                        </div>
                      ) : null}
                    </div>

                    <Money amount={payment.amount} currency={payment.currency} size="small" />
                    <PaymentStatusBadge status={payment.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Surface>

          <Pager
            path="/finance/transactions"
            params={filters}
            page={result.data.page}
            pageSize={result.data.pageSize}
            total={result.data.total}
          />
        </>
      )}
    </FinancePage>
  );
}
