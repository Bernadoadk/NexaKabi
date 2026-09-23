import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Landmark } from 'lucide-react';
import type { FinanceCurrencySummary, FinancePosition, FinanceSummary } from '@nexakabi/contracts';
import { Alert, EmptyState, Money, SimpleBarChart, Stat, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { formatDay, formatShare, toQuery } from '@/lib/finance';
import { AccessDenied } from '../access';
import { ExportLink, FinancePage, PeriodFilter } from './finance-page';

export const metadata: Metadata = { title: 'Finance' };

/**
 * Vue d'ensemble de la finance.
 *
 * ── L'ordre de l'écran suit la question ─────────────────────────────────────
 * Combien est entré, puis ce qui en revient à chacun — la cascade d'une
 * vente, du montant brut au net des organisateurs —, puis ce qui s'est passé
 * après la vente, enfin ce que la plateforme détient À DATE pour les
 * organisateurs. Les montants ne se mélangent jamais entre devises : une
 * section par devise.
 */
export default async function FinanceOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  const params = await searchParams;
  const result = await adminFetch<FinanceSummary>(
    `/finance/summary${toQuery({ du: params.du, au: params.au })}`,
  );

  const period = result.ok ? result.data : null;

  return (
    <FinancePage
      user={user}
      title="Finance"
      description="Ce qui est entré sur la période, ce qui en revient à chacun, et ce que la plateforme détient à date pour les organisateurs."
      actions={
        period ? (
          <ExportLink
            href={`/api/admin/finance/report.csv${toQuery({ regroupement: 'organization', du: period.from, au: period.to })}`}
          >
            Exporter par organisation
          </ExportLink>
        ) : null
      }
    >
      {period ? <PeriodFilter path="/finance" from={period.from} to={period.to} /> : null}

      {!result.ok ? (
        <Alert tone="danger" title="Chiffres indisponibles">
          {result.message}
        </Alert>
      ) : result.data.currencies.length === 0 && result.data.positions.length === 0 ? (
        <EmptyState
          icon={<Landmark size={26} />}
          title="Aucun mouvement sur cette période"
          description="Les ventes, remboursements et retraits apparaîtront ici dès le premier paiement."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {currenciesOf(result.data).map((currency) => (
            <CurrencySection
              key={currency}
              currency={currency}
              summary={result.data.currencies.find((entry) => entry.currency === currency) ?? null}
              position={result.data.positions.find((entry) => entry.currency === currency) ?? null}
              days={result.data.days.filter((day) => day.currency === currency)}
              showCurrency={currenciesOf(result.data).length > 1}
            />
          ))}
        </div>
      )}
    </FinancePage>
  );
}

function currenciesOf(summary: FinanceSummary): string[] {
  return [
    ...new Set([
      ...summary.currencies.map((entry) => entry.currency),
      ...summary.positions.map((entry) => entry.currency),
    ]),
  ].sort();
}

function CurrencySection({
  currency,
  summary,
  position,
  days,
  showCurrency,
}: {
  currency: string;
  summary: FinanceCurrencySummary | null;
  position: FinancePosition | null;
  days: FinanceSummary['days'];
  showCurrency: boolean;
}) {
  const settled = summary ? summary.paymentsSucceeded + summary.paymentsFailed : 0;

  return (
    <section className="flex flex-col gap-4" aria-label={`Montants en ${currency}`}>
      {showCurrency ? (
        <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">{currency}</h2>
      ) : null}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Encaissé brut"
            value={<Money amount={summary.grossCollected} currency={currency} size="medium" />}
            hint={`${summary.ordersPaid} commande${summary.ordersPaid > 1 ? 's' : ''} payée${summary.ordersPaid > 1 ? 's' : ''}`}
          />
          <Stat
            label="Net organisateurs"
            value={<Money amount={summary.organizerNet} currency={currency} size="medium" />}
            hint="Après frais de l’opérateur et commission"
          />
          <Stat
            tone="ink"
            label="Revenu Nexa-Kabi"
            value={<Money amount={summary.platformRevenue} currency={currency} size="medium" />}
            hint="Commission, moins la part restituée, plus les frais de retrait"
          />
          <Stat
            label="Paiements réussis"
            value={settled > 0 ? formatShare(summary.paymentsSucceeded, settled) : '—'}
            hint={`${summary.paymentsFailed} échec${summary.paymentsFailed > 1 ? 's' : ''} sur ${settled} tentative${settled > 1 ? 's' : ''} conclue${settled > 1 ? 's' : ''}`}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {summary ? <Cascade summary={summary} currency={currency} /> : null}
        {position ? <Position position={position} currency={currency} /> : null}
      </div>

      {days.length > 0 ? (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-body font-bold">Commandes payées, jour par jour</h2>
            <p className="text-micro text-text-3">Nombre de commandes, et montant encaissé.</p>
          </div>
          <SimpleBarChart
            points={days.map((day) => ({
              label: formatDay(day.date).replace(/ \d{4}$/, ''),
              value: day.orders,
              valueLabel: `${day.orders} commande${day.orders > 1 ? 's' : ''} le ${formatDay(day.date)}`,
              secondaryValue: <Money amount={day.gross} currency={currency} size="small" />,
            }))}
          />
        </Surface>
      ) : null}
    </section>
  );
}

/**
 * Une vente, en cascade : du montant payé à ce qui revient à l'organisateur.
 *
 * Un relevé chiffré plutôt qu'un graphique : quatre montants qui se
 * soustraient se lisent mieux alignés, avec leur part du brut, que dessinés.
 */
function Cascade({ summary, currency }: { summary: FinanceCurrencySummary; currency: string }) {
  const gross = summary.grossCollected;

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="text-body font-bold">La cascade des ventes</h2>
        <p className="text-micro text-text-3">Commandes payées sur la période.</p>
      </div>

      <dl className="flex flex-col gap-2.5 px-5 py-4 text-body-s">
        <Line label="Montant brut payé" amount={gross} currency={currency} strong />
        <Line
          label="dont frais de service payés par les acheteurs"
          amount={summary.buyerFees}
          currency={currency}
          muted
        />
        <Line
          label="Frais de l’opérateur de paiement"
          amount={-summary.providerFees}
          currency={currency}
          share={formatShare(summary.providerFees, gross)}
        />
        <Line
          label="Commission Nexa-Kabi"
          amount={-summary.platformCommission}
          currency={currency}
          share={formatShare(summary.platformCommission, gross)}
        />
        <div className="border-t border-border pt-2.5">
          <Line
            label="Net organisateurs"
            amount={summary.organizerNet}
            currency={currency}
            share={formatShare(summary.organizerNet, gross)}
            strong
          />
        </div>
      </dl>

      <div className="border-t border-border-subtle bg-surface-alt px-5 py-2.5">
        <h3 className="text-body-s font-bold text-text-2">Après la vente</h3>
      </div>

      <dl className="flex flex-col gap-2.5 px-5 py-4 text-body-s">
        <Line label="Remboursements décidés" amount={summary.refunded} currency={currency} />
        {summary.refundsOutstanding > 0 ? (
          <Line
            label="dont encore à rendre"
            amount={summary.refundsOutstanding}
            currency={currency}
            muted
          />
        ) : null}
        <Line
          label="Commission restituée avec les remboursements"
          amount={summary.commissionReturned}
          currency={currency}
        />
        <Line label="Versé aux organisateurs" amount={summary.paidOut} currency={currency} />
        <Line label="Frais de retrait perçus" amount={summary.payoutFees} currency={currency} />
      </dl>
    </Surface>
  );
}

/**
 * Ce que la plateforme détient pour les organisateurs, À DATE.
 *
 * Une dette : l'argent est sur le compte du prestataire, il appartient aux
 * organisateurs. Hors période — c'est l'état d'aujourd'hui.
 */
function Position({ position, currency }: { position: FinancePosition; currency: string }) {
  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="text-body font-bold">Ce que la plateforme doit, à date</h2>
        <p className="text-micro text-text-3">
          Soldes des organisateurs recalculés depuis le grand livre, hors période.
        </p>
      </div>

      <dl className="flex flex-col gap-2.5 px-5 py-4 text-body-s">
        <Line label="Disponible au retrait" amount={position.available} currency={currency} />
        <Line label="En attente de déblocage" amount={position.pending} currency={currency} />
        <div className="border-t border-border pt-2.5">
          <Line
            label="Total dû aux organisateurs"
            amount={position.available + position.pending}
            currency={currency}
            strong
          />
        </div>
        <Line
          label="Retraits demandés, pas encore versés"
          amount={position.payoutsPending}
          currency={currency}
          muted
        />
        <Line
          label="Remboursements décidés, pas encore rendus"
          amount={position.refundsOutstanding}
          currency={currency}
          muted
        />
      </dl>
    </Surface>
  );
}

function Line({
  label,
  amount,
  currency,
  share,
  strong = false,
  muted = false,
}: {
  label: string;
  amount: number;
  currency: string;
  share?: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={
          strong ? 'font-bold text-text-strong' : muted ? 'pl-3 text-text-3' : 'text-text-2'
        }
      >
        {label}
      </dt>
      <dd className="flex shrink-0 items-baseline gap-2">
        {share ? <span className="tabular text-micro text-text-3">{share}</span> : null}
        <Money
          amount={amount}
          currency={currency}
          size="small"
          className={strong ? 'font-bold' : undefined}
        />
      </dd>
    </div>
  );
}
