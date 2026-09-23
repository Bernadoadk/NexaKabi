import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import {
  FINANCE_REPORT_GROUPINGS,
  FINANCE_REPORT_GROUPING_LABELS,
  type FinanceReport,
  type FinanceReportGrouping,
  type FinanceReportRow,
} from '@nexakabi/contracts';
import { Alert, EmptyState, Money, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { toQuery } from '@/lib/finance';
import { AccessDenied } from '../../access';
import { ExportLink, FilterPill, FinancePage, PeriodFilter } from '../finance-page';

export const metadata: Metadata = { title: 'Rapports' };

/**
 * Rapports : la cascade des ventes, regroupée.
 *
 * Ventes et remboursements se comptent chacun à LEUR date — une vente de
 * janvier remboursée en février pèse sur février. Un mois clos ne bouge donc
 * plus, et ce que l'on exporte aujourd'hui reste vrai demain.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  const params = await searchParams;
  const groupBy: FinanceReportGrouping =
    FINANCE_REPORT_GROUPINGS.find((value) => value === params.regroupement) ?? 'organization';

  const result = await adminFetch<FinanceReport>(
    `/finance/report${toQuery({ regroupement: groupBy, du: params.du, au: params.au })}`,
  );

  return (
    <FinancePage
      user={user}
      title="Rapports"
      description="La cascade des ventes — brut, frais de l’opérateur, commission, net des organisateurs — regroupée et exportable."
      actions={
        result.ok ? (
          <ExportLink
            href={`/api/admin/finance/report.csv${toQuery({ regroupement: groupBy, du: result.data.from, au: result.data.to })}`}
          >
            Exporter en CSV
          </ExportLink>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        {FINANCE_REPORT_GROUPINGS.map((value) => (
          <FilterPill
            key={value}
            href={`/finance/rapports${toQuery({ regroupement: value, du: params.du, au: params.au })}`}
            active={value === groupBy}
          >
            {FINANCE_REPORT_GROUPING_LABELS[value]}
          </FilterPill>
        ))}
      </div>

      {result.ok ? (
        <PeriodFilter
          path="/finance/rapports"
          from={result.data.from}
          to={result.data.to}
          keep={{ regroupement: groupBy }}
        />
      ) : null}

      {!result.ok ? (
        <Alert tone="danger" title="Rapport indisponible">
          {result.message}
        </Alert>
      ) : result.data.rows.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet size={26} />}
          title="Rien à rapporter sur cette période"
          description="Aucune vente, aucun remboursement, aucun versement."
        />
      ) : (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <ul>
            {result.data.rows.map((row) => (
              <ReportLine key={`${row.key}-${row.currency}`} row={row} />
            ))}
            {totals(result.data.rows).map((total) => (
              <ReportLine key={`total-${total.currency}`} row={total} total />
            ))}
          </ul>
        </Surface>
      )}
    </FinancePage>
  );
}

/** Une ligne de total par devise : les montants ne s'additionnent jamais entre devises. */
function totals(rows: FinanceReportRow[]): FinanceReportRow[] {
  const byCurrency = new Map<string, FinanceReportRow>();

  for (const row of rows) {
    const total = byCurrency.get(row.currency) ?? {
      key: 'total',
      label: 'Total',
      currency: row.currency,
      orders: 0,
      gross: 0,
      providerFees: 0,
      commission: 0,
      organizerNet: 0,
      refunded: 0,
      paidOut: row.paidOut === null ? null : 0,
    };

    total.orders += row.orders;
    total.gross += row.gross;
    total.providerFees += row.providerFees;
    total.commission += row.commission;
    total.organizerNet += row.organizerNet;
    total.refunded += row.refunded;
    if (total.paidOut !== null) total.paidOut += row.paidOut ?? 0;

    byCurrency.set(row.currency, total);
  }

  return [...byCurrency.values()];
}

function ReportLine({ row, total = false }: { row: FinanceReportRow; total?: boolean }) {
  return (
    <li
      className={
        total
          ? 'flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-border bg-surface-alt px-5 py-3'
          : 'flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle px-5 py-3 first:border-t-0'
      }
    >
      <div className="min-w-[180px] flex-1">
        <div
          className={
            total
              ? 'text-body-s font-bold text-text-strong'
              : 'text-body-s font-semibold text-text-strong'
          }
        >
          {row.label}
        </div>
        <div className="tabular text-micro text-text-3">
          {row.orders} commande{row.orders > 1 ? 's' : ''} · {row.currency}
        </div>
      </div>
      <Figure label="Brut" amount={row.gross} currency={row.currency} strong={total} />
      <Figure label="Frais opérateur" amount={row.providerFees} currency={row.currency} />
      <Figure label="Commission" amount={row.commission} currency={row.currency} />
      <Figure label="Net organisateurs" amount={row.organizerNet} currency={row.currency} strong />
      <Figure label="Remboursé" amount={row.refunded} currency={row.currency} />
      {row.paidOut !== null ? (
        <Figure label="Versé" amount={row.paidOut} currency={row.currency} />
      ) : null}
    </li>
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
    <div className="flex min-w-[96px] flex-col items-end">
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
