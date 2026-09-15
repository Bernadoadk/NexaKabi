import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchPaymentMethods } from '@/lib/checkout';
import { CheckoutStepper } from '../stepper';
import { loadOrder } from '../order-gate';
import { OrderSummary } from '../order-summary';
import { ReservationTimer } from '../reservation-timer';
import { PaymentFlow } from './payment-flow';

export const metadata: Metadata = {
  title: 'Paiement',
  robots: { index: false, follow: false },
};

/**
 * Écrans A3, A4 et A6 — le paiement.
 *
 * Le rendu initial est serveur, l'état vit ensuite côté client : c'est le seul
 * endroit du tunnel où l'écran doit réagir à un événement qui se produit
 * ailleurs — sur le téléphone de l'acheteur, puis chez l'opérateur.
 */
export default async function CheckoutPaymentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const [gate, methods] = await Promise.all([
    loadOrder(reference.toUpperCase()),
    fetchPaymentMethods(),
  ]);

  if (gate.kind === 'terminal') return gate.render;

  const { order } = gate;

  if (order.status !== 'AWAITING_PAYMENT') {
    redirect(`/checkout/${order.reference}/recapitulatif`);
  }

  return (
    <>
      <CheckoutStepper reference={order.reference} current="paiement" />

      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-display text-h2 font-bold tracking-[-0.02em]">Paiement</h1>
            <span className="tabular text-micro text-text-3">{order.reference}</span>
          </div>
          {order.expiresAt ? <ReservationTimer expiresAt={order.expiresAt} /> : null}
        </header>

        <OrderSummary order={order} showBreakdown />

        <PaymentFlow
          order={order}
          methods={methods.methods}
          notice={methods.notice}
          initialPayment={null}
        />
      </div>
    </>
  );
}
