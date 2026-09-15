import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { CheckoutStepper } from '../stepper';
import { loadOrder } from '../order-gate';
import { OrderSummary } from '../order-summary';
import { ReservationTimer } from '../reservation-timer';
import { BuyerForm } from './buyer-form';

/** Un tunnel d'achat n'a rien à faire dans un index de moteur de recherche. */
export const metadata: Metadata = {
  title: 'Tes coordonnées',
  robots: { index: false, follow: false },
};

/**
 * Écran A1 — billets et participants.
 *
 * La sélection des quantités a eu lieu sur la page événement ; elle est
 * rappelée ici, modifiable d'un lien. Reste à savoir à qui livrer les billets.
 */
export default async function CheckoutTicketsPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const gate = await loadOrder(reference.toUpperCase());

  if (gate.kind === 'terminal') return gate.render;

  const { order } = gate;
  const user = await getCurrentUser();

  return (
    <>
      <CheckoutStepper reference={order.reference} current="billets" />

      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-display text-h2 font-bold tracking-[-0.02em]">Tes coordonnées</h1>
            <span className="tabular text-micro text-text-3">{order.reference}</span>
          </div>
          {order.expiresAt ? <ReservationTimer expiresAt={order.expiresAt} /> : null}
        </header>

        <OrderSummary order={order} changeHref={`/e/${order.eventSlug}`} showBreakdown={false} />

        <BuyerForm order={order} knownName={user?.fullName || undefined} knownPhone={user?.phone} />
      </div>
    </>
  );
}
