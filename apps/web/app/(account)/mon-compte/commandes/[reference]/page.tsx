import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { Order } from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Button, Money, Surface } from '@nexakabi/ui';
import { apiFetchAuthenticated } from '@/lib/session';
import { fetchMyTickets } from '@/lib/tickets';
import { OrderStatusBadge } from '../page';

export const metadata: Metadata = {
  title: 'Détail de la commande',
  robots: { index: false, follow: false },
};

/**
 * Écran U5 — détail d'une commande.
 *
 * Sert de preuve d'achat : chaque franc y est nommé, comme au récapitulatif du
 * tunnel. Les montants sont identiques à ceux affichés avant le paiement — un
 * reçu qui ne correspond pas au devis détruit la confiance plus sûrement qu'un
 * prix élevé.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const upper = reference.toUpperCase();

  const [orderResult, groups] = await Promise.all([
    apiFetchAuthenticated<Order>(`/me/orders/${encodeURIComponent(upper)}`),
    fetchMyTickets(),
  ]);

  if (!orderResult.ok) {
    if (orderResult.error.statusCode === 404) notFound();

    return (
      <Alert tone="danger" title="Commande inaccessible">
        {orderResult.error.message}
      </Alert>
    );
  }

  const order = orderResult.data;

  // Les billets sont servis regroupés par événement : on les remet à plat pour
  // ne garder que ceux de cette commande.
  const orderTickets = groups
    .flatMap((group) => group.tickets)
    .filter((ticket) => ticket.orderReference === order.reference);
  const payable = order.status === 'AWAITING_PAYMENT';

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link
          href="/mon-compte/commandes"
          className="inline-flex items-center gap-1.5 text-body-s text-text-2 hover:text-text-strong"
        >
          <ArrowLeft className="size-3.5" />
          Mes commandes
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">{order.eventTitle}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="flex items-center gap-2 text-body-s text-text-2">
          <span className="tabular font-semibold">{order.reference}</span>
          <span>·</span>
          <span>{formatEventCaptionWithTime(new Date(order.createdAt))}</span>
        </p>
      </header>

      {payable ? (
        <Alert tone="warning" title="Cette commande n’est pas payée">
          Tes places restent réservées jusqu’à l’expiration du délai. Tu peux reprendre le paiement.
          <div className="mt-3">
            <Button asChild variant="primary" size="compact">
              <Link href={`/checkout/${order.reference}/paiement`}>Reprendre le paiement</Link>
            </Button>
          </div>
        </Alert>
      ) : null}

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-4">
          <p className="eyebrow text-text-3">
            {formatEventCaptionWithTime(new Date(order.eventStartsAt))}
          </p>
          <h2 className="mt-0.5 text-h3 font-bold">
            <Link href={`/e/${order.eventSlug}`} className="hover:underline">
              {order.eventTitle}
            </Link>
          </h2>
          {order.eventVenueName || order.eventCityName ? (
            <p className="mt-0.5 text-body-s text-text-2">
              {[order.eventVenueName, order.eventCityName].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>

        <ul className="flex flex-col">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3 border-b border-border-subtle px-5 py-3"
            >
              <span className="text-body-s">
                <span className="font-semibold">{item.quantity} ×</span> {item.ticketTypeName}
              </span>
              <Money amount={item.subtotal} size="small" />
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-2 px-5 py-4">
          <Line label="Sous-total">
            <Money amount={order.subtotalAmount} size="small" />
          </Line>

          {order.discountAmount > 0 ? (
            <Line label="Réduction">
              <Money amount={-order.discountAmount} size="small" showSign />
            </Line>
          ) : null}

          <Line label="Frais de service Nexa-Kabi">
            <Money amount={order.buyerFeeAmount} size="small" />
          </Line>

          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="text-body font-bold">{payable ? 'Total à payer' : 'Montant payé'}</dt>
            <dd>
              <Money amount={order.totalAmount} size="hero" />
            </dd>
          </div>

          {order.paidAt ? (
            <p className="text-micro text-text-3">
              Payée le {formatEventCaptionWithTime(new Date(order.paidAt))}
            </p>
          ) : null}
        </dl>
      </Surface>

      {orderTickets.length > 0 ? (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3">
            <h2 className="text-body font-bold">Billets émis ({orderTickets.length})</h2>
          </div>
          <ul className="flex flex-col">
            {orderTickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-body-s font-semibold">{ticket.attendeeName}</span>
                  <span className="tabular text-micro text-text-3">{ticket.reference}</span>
                </div>
                <Button asChild variant="secondary" size="compact">
                  <Link href={`/mon-compte/billets/${ticket.id}`}>Voir le QR</Link>
                </Button>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      {/* Le remboursement arrive en phase 9 : l'annoncer honnêtement vaut mieux
          qu'un bouton qui ne ferait rien. */}
      <p className="text-center text-micro text-text-3">
        Une question sur cette commande ? Communique la référence{' '}
        <span className="tabular font-semibold">{order.reference}</span> au support.
      </p>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-s text-text-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
