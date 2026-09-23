import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
  type AdminPaymentDetail,
  type PaymentTimelineEntry,
} from '@nexakabi/contracts';
import { formatEventCaptionWithTime, formatMoney } from '@nexakabi/utils';
import { Alert, Badge, Money, Surface, cn } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../../../access';
import { PaymentStatusBadge } from '../../badges';
import { FinancePage } from '../../finance-page';

export const metadata: Metadata = { title: 'Transaction' };

const TONE_DOT: Readonly<Record<PaymentTimelineEntry['tone'], string>> = {
  neutral: 'bg-text-3',
  info: 'bg-blue-700',
  success: 'bg-mint-700',
  warning: 'bg-amber-700',
  danger: 'bg-red-700',
};

/**
 * Une transaction, et tout ce qui lui est arrivé.
 *
 * ── Pourquoi une chronologie ────────────────────────────────────────────────
 * « J'ai payé et je n'ai rien reçu » se tranche en lisant, dans l'ordre : la
 * demande partie chez l'opérateur, ses réponses, la notification reçue — ou
 * perdue et rattrapée —, la commande confirmée, les billets, les écritures.
 * Chaque ligne vient de la base ; rien n'est reconstitué.
 */
export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'finance')) return <AccessDenied user={user} space="finance" />;

  const { id } = await params;
  const result = await adminFetch<AdminPaymentDetail>(
    `/finance/payments/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    return (
      <FinancePage user={user} title="Transaction">
        <BackLink />
        <Alert tone="danger" title="Transaction indisponible">
          {result.message}
        </Alert>
      </FinancePage>
    );
  }

  const payment = result.data;
  const { breakdown } = payment;

  return (
    <FinancePage
      user={user}
      title={`${payment.orderReference} · ${formatMoney(payment.amount, payment.currency)}`}
      description={`${payment.eventTitle} · ${payment.organizationName}`}
      actions={<PaymentStatusBadge status={payment.status} />}
    >
      <BackLink />

      {payment.failureReason ? (
        <Alert tone="danger" title="Motif de l’échec">
          {payment.failureReason}
          {payment.failureCode ? (
            <span className="block text-micro text-text-3">Code : {payment.failureCode}</span>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-body font-bold">Le paiement</h2>
          </div>
          <dl className="flex flex-col gap-2 px-5 py-4 text-body-s">
            <Detail label="Acheteur">{payment.buyerName}</Detail>
            <Detail label="Numéro débité">
              <span className="tabular">{payment.payerPhone ?? '—'}</span>
            </Detail>
            <Detail label="Moyen">
              {payment.methodLabel} · {payment.countryCode}
            </Detail>
            <Detail label="Prestataire">{payment.providerLabel}</Detail>
            <Detail label="Référence prestataire">
              <span className="tabular break-all">{payment.providerReference ?? '—'}</span>
            </Detail>
            <Detail label="Identifiant">
              <span className="tabular break-all">{payment.id}</span>
            </Detail>
            <Detail label="Demandé le">
              {formatEventCaptionWithTime(new Date(payment.createdAt))}
            </Detail>
            {payment.confirmedAt ? (
              <Detail label="Confirmé le">
                {formatEventCaptionWithTime(new Date(payment.confirmedAt))}
              </Detail>
            ) : null}
            {payment.failedAt ? (
              <Detail label="Échoué le">
                {formatEventCaptionWithTime(new Date(payment.failedAt))}
              </Detail>
            ) : null}
            <Detail label="Notification reçue">
              {payment.webhookReceivedAt
                ? formatEventCaptionWithTime(new Date(payment.webhookReceivedAt))
                : 'Aucune'}
            </Detail>
          </dl>
        </Surface>

        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-body font-bold">La commande, en cascade</h2>
            <p className="text-micro text-text-3">
              Figée au paiement : une politique changée depuis n’y touche pas.
            </p>
          </div>
          <dl className="flex flex-col gap-2 px-5 py-4 text-body-s">
            <Amount label="Billets" amount={breakdown.subtotal} currency={payment.currency} />
            {breakdown.discount > 0 ? (
              <Amount label="Remise" amount={-breakdown.discount} currency={payment.currency} />
            ) : null}
            <Amount
              label="Frais de service acheteur"
              amount={breakdown.buyerFee}
              currency={payment.currency}
            />
            <div className="border-t border-border pt-2">
              <Amount label="Payé" amount={breakdown.total} currency={payment.currency} strong />
            </div>
            <Amount
              label="Frais de l’opérateur"
              amount={-breakdown.providerFee}
              currency={payment.currency}
            />
            <Amount
              label="Commission Nexa-Kabi"
              amount={-breakdown.platformCommission}
              currency={payment.currency}
            />
            <div className="border-t border-border pt-2">
              <Amount
                label="Net organisateur"
                amount={breakdown.organizerNet}
                currency={payment.currency}
                strong
              />
            </div>
          </dl>
        </Surface>
      </div>

      {payment.refunds.length > 0 ? (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle px-5 py-4">
            <h2 className="text-body font-bold">Remboursements</h2>
            <Link
              href="/finance/remboursements?file=all"
              className="text-body-s font-semibold text-text-2 hover:text-text-strong"
            >
              Tous les remboursements
            </Link>
          </div>
          <ul>
            {payment.refunds.map((refund) => (
              <li
                key={refund.id}
                className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-3 first:border-t-0"
              >
                <span className="min-w-[200px] flex-1 text-body-s">
                  {REFUND_REASON_LABELS[refund.reason]} · décidé{' '}
                  {formatEventCaptionWithTime(new Date(refund.createdAt))}
                  {refund.manual ? ' · fait à la main' : ''}
                </span>
                <Money amount={refund.amount} currency={payment.currency} size="small" />
                <Badge
                  tone={
                    refund.status === 'COMPLETED'
                      ? 'success'
                      : refund.status === 'FAILED'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {REFUND_STATUS_LABELS[refund.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      {payment.otherPayments.length > 0 ? (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-body font-bold">Autres tentatives de la commande</h2>
          </div>
          <ul>
            {payment.otherPayments.map((other) => (
              <li key={other.id} className="border-t border-border-subtle first:border-t-0">
                <Link
                  href={`/finance/transactions/${other.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-surface-alt"
                >
                  <span className="min-w-[200px] flex-1 text-body-s">
                    {other.methodLabel} · {formatEventCaptionWithTime(new Date(other.createdAt))}
                  </span>
                  <Money amount={other.amount} currency={payment.currency} size="small" />
                  <PaymentStatusBadge status={other.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-body font-bold">Chronologie</h2>
          <p className="text-micro text-text-3">
            Chaque échange avec le prestataire, chaque notification, chaque écriture — dans l’ordre.
          </p>
        </div>
        <ol className="flex flex-col px-5 py-4">
          {payment.timeline.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
              <span className="relative flex w-3 shrink-0 justify-center">
                <span
                  aria-hidden
                  className={cn('mt-1.5 size-2.5 rounded-full', TONE_DOT[entry.tone])}
                />
                {index < payment.timeline.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-4 bottom-[-4px] w-px bg-border-subtle"
                  />
                ) : null}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-s font-semibold text-text-strong">{entry.title}</span>
                {entry.detail ? (
                  <span className="break-words text-micro text-text-2">{entry.detail}</span>
                ) : null}
                <span className="tabular text-micro text-text-3">
                  {formatEventCaptionWithTime(new Date(entry.at))}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </Surface>
    </FinancePage>
  );
}

function BackLink() {
  return (
    <Link
      href="/finance/transactions"
      className="inline-flex items-center gap-1.5 text-body-s text-text-2 hover:text-text-strong"
    >
      <ArrowLeft className="size-3.5" />
      Transactions
    </Link>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-text-3">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-text-strong">{children}</dd>
    </div>
  );
}

function Amount({
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
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-bold text-text-strong' : 'text-text-2'}>{label}</dt>
      <dd>
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
