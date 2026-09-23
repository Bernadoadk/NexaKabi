import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import {
  LEDGER_ENTRY_LABELS,
  type AdminLedgerPage,
  type LedgerEntryType,
  type OrganizationBalanceRow,
} from '@nexakabi/contracts';
import { formatEventCaption, formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Money, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { toQuery } from '@/lib/finance';
import { AccessDenied } from '../../access';
import { ExportLink, FinancePage, Pager } from '../finance-page';

export const metadata: Metadata = { title: 'Grand livre' };

const FIELD =
  'h-9 rounded-field border border-border-field bg-surface px-2.5 text-body-s text-text-strong';

const ENTRY_TYPES = Object.entries(LEDGER_ENTRY_LABELS) as [LedgerEntryType, string][];

/**
 * Le grand livre, toutes organisations confondues.
 *
 * ── Immuable, donc lisible ──────────────────────────────────────────────────
 * Une écriture ne se modifie ni ne se supprime — la base l'interdit. Tout
 * solde affiché ailleurs se recalcule d'ici, et une correction est une
 * écriture de plus, datée et attribuée. Cet écran est donc la réponse
 * définitive à « pourquoi ce solde ? ».
 */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  const params = await searchParams;
  const filters = {
    organisation: params.organisation,
    type: params.type,
    du: params.du,
    au: params.au,
  };

  const [balances, organizations, entries] = await Promise.all([
    adminFetch<OrganizationBalanceRow[]>('/finance/balances'),
    adminFetch<{ id: string; name: string }[]>('/finance/organizations'),
    adminFetch<AdminLedgerPage>(`/finance/ledger${toQuery({ ...filters, page: params.page })}`),
  ]);

  return (
    <FinancePage
      user={user}
      title="Grand livre"
      description="Chaque écriture, immuable. Les soldes affichés partout ailleurs se recalculent d’ici."
      actions={
        <ExportLink href={`/api/admin/finance/ledger.csv${toQuery(filters)}`}>
          Exporter en CSV
        </ExportLink>
      }
    >
      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-body font-bold">Soldes des organisations</h2>
          <p className="text-micro text-text-3">
            À date. Une écriture en attente dont la date est passée compte comme disponible.
          </p>
        </div>

        {!balances.ok ? (
          <div className="p-4">
            <Alert tone="danger">{balances.message}</Alert>
          </div>
        ) : balances.data.length === 0 ? (
          <p className="px-5 py-4 text-body-s text-text-2">Aucune écriture pour l’instant.</p>
        ) : (
          <ul>
            {balances.data.map((row) => (
              <li
                key={`${row.organizationId}-${row.currency}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle px-5 py-3 first:border-t-0"
              >
                <div className="min-w-[180px] flex-1">
                  <Link
                    href={`/finance/grand-livre${toQuery({ organisation: row.organizationId })}`}
                    className="text-body-s font-bold text-text-strong hover:text-coral"
                  >
                    {row.organizationName}
                  </Link>
                  {row.payoutFrozen ? (
                    <Badge tone="danger" className="ml-2">
                      Retraits gelés
                    </Badge>
                  ) : null}
                </div>
                <Figure label="Disponible" amount={row.available} currency={row.currency} />
                <Figure label="En attente" amount={row.pending} currency={row.currency} />
                <Figure label="Total" amount={row.total} currency={row.currency} strong />
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <section className="flex flex-col gap-3" aria-label="Écritures">
        <form method="get" action="/finance/grand-livre" className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[200px] flex-col gap-1 text-micro font-semibold text-text-2">
            Organisation
            <select name="organisation" defaultValue={params.organisation ?? ''} className={FIELD}>
              <option value="">Toutes</option>
              {(organizations.ok ? organizations.data : []).map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-micro font-semibold text-text-2">
            Type
            <select name="type" defaultValue={params.type ?? ''} className={FIELD}>
              <option value="">Tous les types</option>
              {ENTRY_TYPES.map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
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
              href="/finance/grand-livre"
              className="flex h-9 items-center px-2 text-body-s font-semibold text-text-2 hover:text-text-strong"
            >
              Effacer
            </Link>
          ) : null}
        </form>

        {!entries.ok ? (
          <Alert tone="danger" title="Écritures indisponibles">
            {entries.message}
          </Alert>
        ) : entries.data.items.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={26} />}
            title="Aucune écriture ne correspond"
            description="Élargis la période ou retire un filtre."
          />
        ) : (
          <>
            <Surface variant="panel" padding="none" className="overflow-hidden">
              <ul>
                {entries.data.items.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-3 first:border-t-0"
                  >
                    <div className="min-w-[220px] flex-1">
                      <div className="text-body-s font-semibold text-text-strong">
                        {LEDGER_ENTRY_LABELS[entry.type]} · {entry.organizationName}
                      </div>
                      <div className="text-micro text-text-3">
                        {entry.description}
                        {entry.eventTitle ? ` · ${entry.eventTitle}` : ''}
                      </div>
                      <div className="text-micro text-text-3">
                        {formatEventCaptionWithTime(new Date(entry.createdAt))}
                        {entry.balanceState === 'PENDING'
                          ? entry.availableAt
                            ? ` · en attente jusqu’au ${formatEventCaption(new Date(entry.availableAt))}`
                            : ' · en attente de la vérification'
                          : ''}
                        {entry.paymentId ? (
                          <>
                            {' · '}
                            <Link
                              href={`/finance/transactions/${entry.paymentId}`}
                              className="font-semibold text-text-2 hover:text-text-strong"
                            >
                              voir le paiement
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <Money amount={entry.amount} currency={entry.currency} size="small" showSign />
                  </li>
                ))}
              </ul>
            </Surface>

            <Pager
              path="/finance/grand-livre"
              params={filters}
              page={entries.data.page}
              pageSize={entries.data.pageSize}
              total={entries.data.total}
            />
          </>
        )}
      </section>
    </FinancePage>
  );
}

function Figure({
  label,
  amount,
  currency,
  strong = false,
}: {
  label: string;
  amount: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className="flex min-w-[110px] flex-col items-end">
      <span className="text-micro text-text-3">{label}</span>
      <Money
        amount={amount}
        currency={currency}
        size="small"
        className={strong ? 'font-bold' : undefined}
      />
    </div>
  );
}
