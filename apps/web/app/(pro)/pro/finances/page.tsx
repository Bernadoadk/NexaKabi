import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  HOLD_TIERS,
  LEDGER_ENTRY_LABELS,
  PAYOUT_STATUS_LABELS,
  resolveHoldTier,
  type Balance,
  type LedgerEntry,
  type OrganizationStats,
  type Payout,
} from '@nexakabi/contracts';
import { formatDateShort, formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Badge, Money, SimpleBarChart, Stat, Surface } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { orgFetch, resolveActiveOrganization } from '@/lib/organizations';
import { PayoutRequestForm } from './payout-form';

export const metadata: Metadata = { title: 'Finances' };

interface PayoutAccount {
  id: string;
  type: string;
  provider: string | null;
  bankName: string | null;
  accountNumber: string;
  isDefault: boolean;
}

/**
 * Écran O11 — finances.
 *
 * ── Ce que cet écran doit accomplir ─────────────────────────────────────────
 * Répondre à trois questions, dans cet ordre : combien puis-je retirer, quand
 * le reste sera-t-il disponible, et pourquoi le total n'est pas ce que j'ai
 * vendu. La troisième est la plus importante : c'est celle qui, mal traitée,
 * fait perdre un organisateur.
 *
 * Chaque montant affiché ici est donc adossé à des écritures du grand livre,
 * consultables ligne par ligne juste en dessous.
 *
 * ── Correctif ────────────────────────────────────────────────────────────
 * Les quatre appels ci-dessous utilisaient `apiFetchAuthenticated` sans
 * indiquer d'organisation. Or `OrgMemberGuard` (API) exige soit un segment de
 * route, soit l'en-tête `X-Organization-Id` — aucun des deux n'a de repli
 * possible ici (contrairement aux routes qui portent un `eventId`, dont
 * l'organisation se déduit). Sans organisation résolue, chaque appel
 * échouait avec « Aucune organisation indiquée » : cet écran était donc en
 * erreur pour tout le monde, pas seulement inatteignable depuis la nav.
 */
export default async function FinancesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?suite=/pro/finances');

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const [balanceResult, statementResult, payoutsResult, accountsResult, statsResult] =
    await Promise.all([
      orgFetch<Balance>(active.id, '/organizer/finance/balance'),
      orgFetch<LedgerEntry[]>(active.id, '/organizer/finance/statement?limit=60'),
      orgFetch<Payout[]>(active.id, '/organizer/finance/payouts'),
      orgFetch<PayoutAccount[]>(active.id, '/organizer/organizations/current/payout-accounts'),
      orgFetch<OrganizationStats>(active.id, '/organizer/finance/organization/stats'),
    ]);

  if (!balanceResult.ok) {
    return (
      <Alert tone="danger" title="Finances indisponibles">
        {balanceResult.error.message}
      </Alert>
    );
  }

  const balance = balanceResult.data;
  const statement = statementResult.ok ? statementResult.data : [];
  const payouts = payoutsResult.ok ? payoutsResult.data : [];
  const accounts = accountsResult.ok ? accountsResult.data : [];
  const salesByDay = statsResult.ok ? statsResult.data.salesByDay : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Finances</h1>
        <p className="text-body-s text-text-2">
          Chaque montant est adossé à des écritures détaillées, consultables ci-dessous.
        </p>
      </header>

      {/* Le solde, en premier et en grand : c'est la question posée. */}
      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="eyebrow text-text-3">Solde disponible</p>
          <Money amount={balance.availableAmount} size="large" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="En attente de déblocage"
            value={<Money amount={balance.pendingAmount} size="medium" />}
          />
          <Stat
            label="Total encaissé"
            value={<Money amount={balance.grossSales} size="medium" />}
          />
          <Stat label="Déjà retiré" value={<Money amount={balance.paidOut} size="medium" />} />
        </div>

        {balance.nextReleaseAt ? (
          <p className="text-body-s text-text-2">
            Prochain déblocage le{' '}
            <span className="font-semibold">
              {formatEventCaptionWithTime(new Date(balance.nextReleaseAt))}
            </span>
          </p>
        ) : null}
      </Surface>

      {/* La question « pourquoi je ne reçois pas ce que j'ai vendu » mérite une
          réponse chiffrée, pas une note en bas de page. */}
      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-body font-bold">D’où vient ce montant</h2>
        </div>
        <dl className="flex flex-col gap-2 px-5 py-4">
          <Line label="Encaissé auprès des participants">
            <Money amount={balance.grossSales} size="small" />
          </Line>
          <Line label="Commission Nexa-Kabi">
            <Money amount={-balance.platformFees} size="small" showSign />
          </Line>
          {balance.providerFees > 0 ? (
            <Line label="Frais opérateur Mobile Money">
              <Money amount={-balance.providerFees} size="small" showSign />
            </Line>
          ) : null}
          {balance.refunds > 0 ? (
            <Line label="Remboursements">
              <Money amount={-balance.refunds} size="small" showSign />
            </Line>
          ) : null}
          {balance.paidOut > 0 ? (
            <Line label="Retraits effectués">
              <Money amount={-balance.paidOut} size="small" showSign />
            </Line>
          ) : null}

          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="text-body font-bold">Solde total</dt>
            <dd>
              <Money amount={balance.totalAmount} size="default" />
            </dd>
          </div>
        </dl>
      </Surface>

      {salesByDay.length > 0 ? (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3">
            <h2 className="text-body font-bold">Activité récente</h2>
          </div>
          <SimpleBarChart
            points={salesByDay.map((point) => ({
              label: formatDateShort(new Date(point.date)),
              value: point.ticketCount,
              valueLabel: `${point.ticketCount} billet${point.ticketCount > 1 ? 's' : ''}`,
              secondaryValue: <Money amount={point.grossAmount} size="small" />,
            }))}
          />
        </Surface>
      ) : null}

      <PayoutSection balance={balance} accounts={accounts} />

      {payouts.length > 0 ? (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3">
            <h2 className="text-body font-bold">Retraits</h2>
          </div>
          <ul className="flex flex-col">
            {payouts.map((payout) => (
              <li key={payout.id}>
                <Link
                  href={`/pro/finances/retraits/${payout.id}`}
                  className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-3.5 transition last:border-b-0 hover:bg-paper"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="tabular text-body-s font-semibold">{payout.reference}</span>
                    <span className="text-micro text-text-3">
                      {formatEventCaptionWithTime(new Date(payout.requestedAt))} ·{' '}
                      {payout.accountLabel}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <PayoutBadge status={payout.status} />
                    <Money amount={payout.netAmount} size="small" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-body font-bold">Relevé détaillé</h2>
        </div>

        {statement.length === 0 ? (
          <p className="px-5 py-6 text-center text-body-s text-text-2">
            Aucune écriture pour le moment. Ta première vente apparaîtra ici.
          </p>
        ) : (
          <ul className="flex flex-col">
            {statement.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-body-s font-semibold">{entry.description}</span>
                  <span className="flex items-center gap-2 text-micro text-text-3">
                    <span>{LEDGER_ENTRY_LABELS[entry.type]}</span>
                    <span>·</span>
                    <span>{formatEventCaptionWithTime(new Date(entry.createdAt))}</span>
                    {entry.balanceState === 'PENDING' ? (
                      <>
                        <span>·</span>
                        <span className="font-semibold text-amber-700">Bloqué</span>
                      </>
                    ) : null}
                  </span>
                </div>
                <Money
                  amount={entry.amount}
                  size="small"
                  showSign
                  className={entry.amount < 0 ? 'text-text-2' : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

/**
 * Demande de retrait, ou explication de son impossibilité.
 *
 * Quand le retrait est bloqué, l'écran dit POURQUOI et QUOI FAIRE. « Retrait
 * indisponible » sans motif est la formule qui fait appeler le support.
 */
function PayoutSection({ balance, accounts }: { balance: Balance; accounts: PayoutAccount[] }) {
  if (!balance.canRequestPayout) {
    return (
      <Alert tone="warning" title="Retrait indisponible">
        {balance.payoutBlockedReason}
      </Alert>
    );
  }

  if (accounts.length === 0) {
    return (
      <Alert tone="info" title="Ajoute un compte de retrait">
        Renseigne un numéro Mobile Money ou un compte bancaire dans les paramètres de ton
        organisation pour recevoir tes recettes.
      </Alert>
    );
  }

  return <PayoutRequestForm accounts={accounts} availableAmount={balance.availableAmount} />;
}

function PayoutBadge({ status }: { status: Payout['status'] }) {
  const tone =
    status === 'PAID'
      ? 'success'
      : status === 'FAILED'
        ? 'danger'
        : status === 'PROCESSING'
          ? 'info'
          : 'neutral';

  return <Badge tone={tone}>{PAYOUT_STATUS_LABELS[status]}</Badge>;
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-s text-text-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Palier de déblocage, décrit en clair. Exporté pour l'écran d'organisation. */
export function HoldTierNotice({
  isVerified,
  completedEventsCount,
}: {
  isVerified: boolean;
  completedEventsCount: number;
}) {
  const tier = resolveHoldTier({ isVerified, completedEventsCount });
  const next = HOLD_TIERS[tier.tier + 1];

  return (
    <div className="flex flex-col gap-1.5 rounded-card bg-surface-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <Badge tone={tier.tier === 0 ? 'warning' : 'success'}>{tier.label}</Badge>
      </div>
      <p className="text-body-s text-text-2">{tier.description}</p>
      {next ? (
        <p className="text-micro text-text-3">
          Prochain palier : {next.label} — {next.description}
        </p>
      ) : null}
    </div>
  );
}
