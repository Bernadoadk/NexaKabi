import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import type { Order } from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Badge, Button, EmptyState, Money, Surface } from '@nexakabi/ui';
import { apiFetchAuthenticated } from '@/lib/session';

export const metadata: Metadata = { title: 'Mes commandes' };

/**
 * Écran U4 — historique des commandes.
 *
 * Distinct de « Mes billets », et ce n'est pas une redondance : le billet sert
 * à entrer, la commande sert à prouver un paiement. Un participant qui cherche
 * un reçu, un remboursement ou une référence à donner au support vient ici.
 */
export default async function MyOrdersPage() {
  const result = await apiFetchAuthenticated<Order[]>('/me/orders');
  const orders = result.ok ? result.data : [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Mes commandes</h1>
        <p className="text-body-s text-text-2">
          {orders.length === 0
            ? 'Aucune commande pour le moment.'
            : `${orders.length} commande${orders.length > 1 ? 's' : ''}`}
        </p>
      </header>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} />}
          title="Aucune commande"
          description="Tes achats et leurs reçus apparaîtront ici."
          action={
            <Button asChild variant="primary" size="primary">
              <Link href="/evenements">Découvrir les événements</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Surface variant="panel" padding="none">
                <Link
                  href={`/mon-compte/commandes/${order.reference}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-surface-alt"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body font-bold">{order.eventTitle}</span>
                    <span className="flex items-center gap-2 text-micro text-text-3">
                      <span className="tabular">{order.reference}</span>
                      <span>·</span>
                      <span>{formatEventCaptionWithTime(new Date(order.createdAt))}</span>
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <OrderStatusBadge status={order.status} refund={order.refund} />
                    <Money amount={order.totalAmount} currency={order.currency} size="small" />
                  </div>
                </Link>
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Statut de commande, tel que le participant le comprend.
 *
 * « AWAITING_PAYMENT » ne veut rien dire pour un acheteur : ce qu'il retient,
 * c'est qu'il n'a pas fini de payer et qu'il peut reprendre. De même,
 * « remboursée » ne se dit qu'une fois l'argent reparti vers lui — pas au
 * moment où le remboursement est décidé.
 */
export function OrderStatusBadge({
  status,
  refund,
}: {
  status: Order['status'];
  refund?: Order['refund'];
}) {
  switch (status) {
    case 'PAID':
    case 'COMPLETED':
      return <Badge tone="success">Payée</Badge>;
    case 'AWAITING_PAYMENT':
      return <Badge tone="warning">À payer</Badge>;
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      if (refund?.state === 'IN_PROGRESS') {
        return <Badge tone="warning">Remboursement en cours</Badge>;
      }
      return (
        <Badge tone="info">
          {status === 'PARTIALLY_REFUNDED' ? 'Remboursée en partie' : 'Remboursée'}
        </Badge>
      );
    case 'CANCELLED':
      return <Badge tone="neutral">Annulée</Badge>;
    case 'EXPIRED':
      return <Badge tone="neutral">Expirée</Badge>;
    default:
      return <Badge tone="neutral">Brouillon</Badge>;
  }
}
