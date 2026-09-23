import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import {
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
  type AdminRefund,
  type RefundQueue,
} from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Money, Surface } from '@nexakabi/ui';
import { adminFetch, canMoveMoney, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied, ReadOnlyNotice } from '../../access';
import { FilterPill, FinancePage } from '../finance-page';
import { NewRefundForm } from './new-refund-form';
import { RecordRefundForm } from './record-form';
import { RetryButton } from './retry-button';

export const metadata: Metadata = { title: 'Remboursements' };

type QueueFilter = RefundQueue | 'all';

const QUEUES: readonly [QueueFilter, string][] = [
  ['todo', 'À faire'],
  ['processing', 'En cours'],
  ['done', 'Remboursés'],
  ['all', 'Tous'],
];

const EMPTY_MESSAGES: Readonly<Record<QueueFilter, string>> = {
  todo: 'Aucun participant n’attend un remboursement à faire à la main.',
  processing: 'Aucun remboursement n’est en cours chez l’opérateur.',
  done: 'Les remboursements conclus apparaîtront ici.',
  all: 'Les remboursements décidés apparaîtront ici.',
};

/**
 * Remboursements des participants.
 *
 * ── Ce que cet écran rend possible ────────────────────────────────────────
 * Le service de remboursement existait, mais aucun écran ne l'exposait : un
 * remboursement au cas par cas était impossible, et ceux qu'une annulation
 * d'événement n'arrivait pas à confier au prestataire ne se voyaient nulle
 * part. KPay ne rembourse que la totalité d'un paiement, dans les sept jours ;
 * tout le reste se fait à la main — et doit donc se lire ici, s'y faire, et
 * s'y consigner.
 *
 * La file « À faire » vient en premier : chaque ligne est un participant qui
 * attend son argent.
 */
export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  // Rembourser, c'est déplacer de l'argent : le droit sur l'espace ne suffit
  // pas, il faut aussi celui des mouvements d'argent.
  const allowed = hasAdminAccess(user, 'finance', 'act') && canMoveMoney(user);

  const params = await searchParams;
  const queue: QueueFilter = QUEUES.find(([value]) => value === params.file)?.[0] ?? 'todo';

  const result = await adminFetch<AdminRefund[]>(
    `/refunds${queue === 'all' ? '' : `?file=${queue}`}`,
  );

  return (
    <FinancePage
      user={user}
      title="Remboursements"
      description="Un remboursement décidé quitte aussitôt le solde de l’organisateur. L’opérateur s’en charge quand il le peut — la totalité du paiement, dans les 7 jours ; sinon, il se fait à la main, puis s’enregistre ici."
    >
      {allowed ? (
        <NewRefundForm />
      ) : (
        <ReadOnlyNotice what="rembourser ni enregistrer un remboursement" />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {QUEUES.map(([value, label]) => (
          <FilterPill
            key={value}
            href={
              value === 'todo' ? '/finance/remboursements' : `/finance/remboursements?file=${value}`
            }
            active={queue === value}
          >
            {label}
          </FilterPill>
        ))}
      </div>

      {!result.ok ? (
        <Alert tone="danger" title="Liste indisponible">
          {result.message}
        </Alert>
      ) : result.data.length === 0 ? (
        <EmptyState
          icon={<CircleCheck size={26} />}
          title="Rien dans cette file"
          description={EMPTY_MESSAGES[queue]}
        />
      ) : (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <ul>
            {result.data.map((refund) => (
              <RefundRow key={refund.id} refund={refund} allowed={allowed} />
            ))}
          </ul>
        </Surface>
      )}
    </FinancePage>
  );
}

function RefundRow({ refund, allowed }: { refund: AdminRefund; allowed: boolean }) {
  const open = refund.status !== 'COMPLETED';

  return (
    <li className="flex flex-col gap-3 border-t border-border-subtle p-4 first:border-t-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="text-body font-bold text-text-strong">
            {refund.buyerName}{' '}
            <span className="tabular font-medium text-text-3">· {refund.payerPhone}</span>
          </div>
          <div className="text-micro text-text-3">
            <span className="tabular">{refund.orderReference}</span> · {refund.eventTitle} ·{' '}
            <Link
              href={`/organisations/${refund.organizationId}`}
              className="font-semibold hover:text-coral"
            >
              {refund.organizationName}
            </Link>
          </div>
          <div className="text-micro text-text-3">
            {REFUND_REASON_LABELS[refund.reason]} ·{' '}
            {refund.feesRefunded ? 'frais de service compris' : 'hors frais de service'} ·{' '}
            {refund.methodLabel} · décidé {formatEventCaptionWithTime(new Date(refund.createdAt))}
          </div>
        </div>

        <Money amount={refund.amount} currency={refund.currency} size="small" />

        <RefundBadge refund={refund} />
      </div>

      <RefundExplanation refund={refund} />

      {allowed && open ? (
        <div className="flex flex-wrap items-start justify-end gap-2">
          {(refund.status === 'PENDING' || refund.status === 'FAILED') &&
          refund.automaticBlocker === null ? (
            <RetryButton
              refundId={refund.id}
              label={
                refund.status === 'PENDING'
                  ? `Rembourser par ${refund.providerLabel}`
                  : `Relancer chez ${refund.providerLabel}`
              }
            />
          ) : null}
          <RecordRefundForm
            refundId={refund.id}
            amount={refund.amount}
            currency={refund.currency}
            payerPhone={refund.payerPhone}
            payerPhoneMasked={refund.payerPhoneMasked}
            methodLabel={refund.methodLabel}
            label={
              refund.status === 'PROCESSING' ? 'Conclure à la main' : 'Enregistrer le remboursement'
            }
          />
        </div>
      ) : null}
    </li>
  );
}

/** Ce qu'il faut savoir pour agir — ou ce qui s'est passé. */
function RefundExplanation({ refund }: { refund: AdminRefund }) {
  if (refund.status === 'COMPLETED') {
    return (
      <p className="text-micro text-text-3">
        Remboursé {refund.manual ? 'à la main' : `par ${refund.providerLabel}`}
        {refund.providerReference ? (
          <>
            {' '}
            · réf. <span className="tabular">{refund.providerReference}</span>
          </>
        ) : null}
        {refund.completedAt
          ? ` · ${formatEventCaptionWithTime(new Date(refund.completedAt))}`
          : null}
      </p>
    );
  }

  if (refund.status === 'PROCESSING') {
    return (
      <p className="text-micro text-text-3">
        {refund.providerLabel} traite la demande
        {refund.providerReference ? (
          <>
            {' '}
            · réf. <span className="tabular">{refund.providerReference}</span>
          </>
        ) : null}
        . L’issue arrive d’elle-même ; ne conclus à la main qu’après l’avoir vérifiée chez
        l’opérateur.
      </p>
    );
  }

  // Dû, et pas en cours : la raison est ce que l'administrateur doit lire.
  const reason = refund.failureReason ?? refund.automaticBlocker;

  if (!reason) return null;

  return (
    <Alert tone={refund.status === 'FAILED' ? 'danger' : 'warning'}>
      {reason}
      {refund.note ? <span className="block text-text-3">Motif : {refund.note}</span> : null}
    </Alert>
  );
}

function RefundBadge({ refund }: { refund: AdminRefund }) {
  const tone =
    refund.status === 'COMPLETED'
      ? 'success'
      : refund.status === 'FAILED'
        ? 'danger'
        : refund.status === 'PROCESSING'
          ? 'info'
          : 'warning';

  return <Badge tone={tone}>{REFUND_STATUS_LABELS[refund.status]}</Badge>;
}
