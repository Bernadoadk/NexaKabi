import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import {
  PAYOUT_STATUS_LABELS,
  type AdminPayoutSummary,
  type PayoutStatus,
} from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Money, Surface } from '@nexakabi/ui';
import { adminFetch, canMoveMoney, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../access';
import { FinanceNav } from '../finance/finance-page';
import { AdminShell } from '../shell';
import { ExecuteButton } from './execute-button';
import { RecordPayoutForm } from './record-form';

export const metadata: Metadata = { title: 'Retraits' };

const STATUS_FILTERS: readonly [PayoutStatus | '', string][] = [
  ['', 'Tous'],
  ['PENDING', 'En attente'],
  ['PROCESSING', 'En cours'],
  ['PAID', 'Effectués'],
  ['FAILED', 'Échoués'],
];

/**
 * Écran M11 — retraits de la plateforme.
 *
 * ── Le manque que cet écran comble ────────────────────────────────────────
 * `POST /admin/payouts/:id/execute` existait déjà, et le tableau de bord
 * comptait les retraits en attente — mais sa tuile renvoyait vers
 * `/signalements`, un écran qui n'a jamais montré un seul retrait. Il n'y
 * avait donc, concrètement, aucun moyen d'exécuter un versement autrement
 * qu'en appelant l'API à la main avec un identifiant déjà connu.
 */
export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'payouts')) return <AccessDenied user={user} space="payouts" />;
  const canAct = hasAdminAccess(user, 'payouts', 'act');
  const money = canMoveMoney(user);

  const params = await searchParams;
  const status = params.statut as PayoutStatus | undefined;

  const result = await adminFetch<AdminPayoutSummary[]>(
    `/payouts${status ? `?statut=${status}` : ''}`,
  );

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        {/* Les retraits font partie de la finance : qui voit les deux navigue entre eux. */}
        {hasAdminAccess(user, 'finance') ? <FinanceNav user={user} /> : null}

        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Retraits</h1>
          <p className="text-body-s text-text-2">
            Toutes organisations confondues. Exécuter déclenche le versement chez l’opérateur ; un
            virement bancaire se fait depuis la banque, puis s’enregistre ici.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map(([value, label]) => (
            <Link
              key={value || 'all'}
              href={value ? `/retraits?statut=${value}` : '/retraits'}
              className={
                (status ?? '') === value
                  ? 'rounded-full bg-ink px-3 py-1.5 text-body-s font-semibold text-white'
                  : 'rounded-full border border-border-field bg-surface px-3 py-1.5 text-body-s font-semibold text-text-2 hover:bg-paper'
              }
            >
              {label}
            </Link>
          ))}
        </div>

        {!result.ok ? (
          <Alert tone="danger" title="Liste indisponible">
            {result.message}
          </Alert>
        ) : result.data.length === 0 ? (
          <EmptyState
            icon={<CircleCheck size={26} />}
            title="Aucun retrait ne correspond"
            description="Les demandes des organisateurs apparaîtront ici."
          />
        ) : (
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <ul>
              {result.data.map((payout) => (
                <li
                  key={payout.id}
                  className="flex flex-wrap items-center gap-3 border-t border-border-subtle p-4 first:border-t-0"
                >
                  <div className="min-w-[220px] flex-1">
                    <Link
                      href={`/organisations/${payout.organizationId}`}
                      className="text-body font-bold text-text-strong hover:text-coral"
                    >
                      {payout.organizationName}
                    </Link>
                    <div className="text-micro text-text-3">
                      <span className="tabular">{payout.reference}</span> ·{' '}
                      {formatEventCaptionWithTime(new Date(payout.requestedAt))} ·{' '}
                      {payout.accountLabel}
                    </div>
                  </div>

                  <Money amount={payout.netAmount} currency={payout.currency} size="small" />

                  <PayoutBadge status={payout.status} />

                  <PayoutActions payout={payout} allowed={canAct && money} />
                </li>
              ))}
            </ul>
          </Surface>
        )}
      </div>
    </AdminShell>
  );
}

/**
 * Le geste qui convient à un retrait, selon son compte et son état.
 *
 * Versement automatique en attente — un prestataire branché sait verser sur
 * ce moyen dans ce pays : « Exécuter » suffit, et l'enregistrement manuel
 * reste à portée pour le jour où il refuse. Versement manuel — virement
 * bancaire, ou moyen sans prestataire : personne d'autre que l'administrateur
 * ne le fait, il n'y a qu'à l'enregistrer. En cours : l'interrogation
 * conclura d'elle-même, mais un versement que le prestataire ne conclut
 * jamais doit pouvoir être clos ici.
 */
function PayoutActions({ payout, allowed }: { payout: AdminPayoutSummary; allowed: boolean }) {
  // Sans le droit « Mouvements d'argent », un retrait se lit, il ne se
  // déclenche pas : les boutons disparaissent au lieu d'échouer au clic.
  if (!allowed) return null;

  if (payout.status === 'PENDING' && payout.automatic) {
    return (
      <div className="flex w-full flex-wrap items-start justify-end gap-2 sm:w-auto">
        <ExecuteButton payoutId={payout.id} />
        <RecordPayoutForm payoutId={payout.id} />
      </div>
    );
  }

  if (payout.status === 'PENDING') {
    return <RecordPayoutForm payoutId={payout.id} label="Enregistrer le virement" />;
  }

  if (payout.status === 'PROCESSING') {
    return <RecordPayoutForm payoutId={payout.id} label="Conclure à la main" />;
  }

  return null;
}

function PayoutBadge({ status }: { status: PayoutStatus }) {
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
