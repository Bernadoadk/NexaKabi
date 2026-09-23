import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import {
  RECONCILIATION_ISSUE_LABELS,
  type ProviderWallet,
  type ReconciliationIssue,
  type ReconciliationReport,
} from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Money, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../../access';
import { FinancePage } from '../finance-page';
import { RunButton } from './run-button';

export const metadata: Metadata = { title: 'Rapprochement' };

const SEVERITY_LABELS: Readonly<Record<ReconciliationIssue['severity'], string>> = {
  high: 'Urgent',
  medium: 'À vérifier',
  low: 'Pour information',
};

/**
 * Rapprochement : ce que nos écritures disent, face à ce qui s'est passé.
 *
 * ── Une liste d'écarts à traiter ────────────────────────────────────────────
 * Chaque ligne est une question précise, avec l'endroit où y répondre. La
 * bonne page est une page vide. Les passes automatiques tournent chaque
 * minute ; celle-ci se lance à la demande.
 *
 * ── Ce qui ne se voit que par le solde ──────────────────────────────────────
 * KPay ne publie pas la liste de ses transactions. Une transaction que nous
 * ne connaissons pas ne se découvre que par sa notification — « sans objet »
 * ci-dessous — ou par l'écart du solde de son wallet.
 */
export default async function ReconciliationPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  const canRun = hasAdminAccess(user, 'finance', 'act');
  const result = await adminFetch<ReconciliationReport>('/finance/reconciliation');

  return (
    <FinancePage
      user={user}
      title="Rapprochement"
      description="Les écarts entre ce que nos écritures disent et ce qui s’est passé chez le prestataire. Une page vide est le bon résultat."
      actions={canRun ? <RunButton /> : null}
    >
      {!result.ok ? (
        <Alert tone="danger" title="Rapprochement indisponible">
          {result.message}
        </Alert>
      ) : (
        <>
          <Wallets wallets={result.data.wallets} />

          <section className="flex flex-col gap-3" aria-label="Écarts">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-body font-bold">
                {result.data.issues.length === 0
                  ? 'Aucun écart'
                  : `${result.data.issues.length} écart${result.data.issues.length > 1 ? 's' : ''} à traiter`}
              </h2>
              <span className="text-micro text-text-3">
                Relevé {formatEventCaptionWithTime(new Date(result.data.generatedAt))}
              </span>
            </div>

            {result.data.issues.length === 0 ? (
              <EmptyState
                icon={<CircleCheck size={26} />}
                title="Tout concorde"
                description="Aucun paiement en suspens, aucune notification sans objet, aucun remboursement en retard."
              />
            ) : (
              <Surface variant="panel" padding="none" className="overflow-hidden">
                <ul>
                  {result.data.issues.map((issue, index) => (
                    <IssueRow key={`${issue.kind}-${issue.at}-${index}`} issue={issue} />
                  ))}
                </ul>
              </Surface>
            )}
          </section>
        </>
      )}
    </FinancePage>
  );
}

function IssueRow({ issue }: { issue: ReconciliationIssue }) {
  const content = (
    <div className="flex flex-wrap items-start gap-3 px-5 py-3">
      <div className="min-w-[220px] flex-1">
        <div className="text-micro font-bold uppercase tracking-wide text-text-3">
          {RECONCILIATION_ISSUE_LABELS[issue.kind]}
        </div>
        <div className="text-body-s font-semibold text-text-strong">{issue.title}</div>
        <div className="text-micro text-text-2">{issue.detail}</div>
        <div className="text-micro text-text-3">
          {formatEventCaptionWithTime(new Date(issue.at))}
        </div>
      </div>
      <Badge
        tone={
          issue.severity === 'high' ? 'danger' : issue.severity === 'medium' ? 'warning' : 'neutral'
        }
      >
        {SEVERITY_LABELS[issue.severity]}
      </Badge>
    </div>
  );

  return (
    <li className="border-t border-border-subtle first:border-t-0">
      {issue.href ? (
        <Link href={issue.href} className="block hover:bg-surface-alt">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

/**
 * Le solde de chaque wallet, face à nos écritures.
 *
 * L'écart n'est pas censé être nul : les frais que le prestataire prend sur
 * les retraits ne nous sont pas annoncés. C'est son ÉVOLUTION qui compte — un
 * écart qui grandit sans retrait désigne un mouvement inconnu.
 */
function Wallets({ wallets }: { wallets: ProviderWallet[] }) {
  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="text-body font-bold">Solde chez le prestataire</h2>
        <p className="text-micro text-text-3">
          Attendu = encaissé net de sa commission − versé − remboursé par lui. Ses frais de retrait
          ne sont pas annoncés : un petit écart stable est normal, un écart qui grandit ne l’est
          pas.
        </p>
      </div>

      {wallets.length === 0 ? (
        <p className="px-5 py-4 text-body-s text-text-2">
          Aucun prestataire branché ne publie son solde. Avec les clés KPay, son wallet apparaîtra
          ici.
        </p>
      ) : (
        <ul>
          {wallets.map((wallet) => {
            const gap = wallet.reported ? wallet.reported.balance - wallet.expected : null;

            return (
              <li
                key={`${wallet.providerCode}-${wallet.currency}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border-subtle px-5 py-3 first:border-t-0"
              >
                <div className="min-w-[140px] flex-1">
                  <div className="text-body-s font-bold text-text-strong">
                    {wallet.providerLabel} · {wallet.currency}
                  </div>
                  {wallet.error ? (
                    <div className="text-micro text-red-700">{wallet.error}</div>
                  ) : null}
                  {wallet.reported && wallet.reported.reserved > 0 ? (
                    <div className="text-micro text-text-3">
                      dont réservé (remboursements, retraits en cours) :{' '}
                      <Money
                        amount={wallet.reported.reserved}
                        currency={wallet.currency}
                        size="small"
                      />
                    </div>
                  ) : null}
                </div>
                <Figure
                  label="Annoncé"
                  amount={wallet.reported?.balance ?? null}
                  currency={wallet.currency}
                />
                <Figure label="Attendu" amount={wallet.expected} currency={wallet.currency} />
                <Figure label="Écart" amount={gap} currency={wallet.currency} strong />
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}

function Figure({
  label,
  amount,
  currency,
  strong = false,
}: {
  label: string;
  amount: number | null;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className="flex min-w-[110px] flex-col items-end">
      <span className="text-micro text-text-3">{label}</span>
      {amount === null ? (
        <span className="text-body-s text-text-3">—</span>
      ) : (
        <Money
          amount={Math.round(amount)}
          currency={currency}
          size="small"
          showSign={strong}
          className={strong ? 'font-bold' : undefined}
        />
      )}
    </div>
  );
}
