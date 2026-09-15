import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Surface } from '@nexakabi/ui';
import { CheckoutStepper } from '../stepper';
import { loadOrder } from '../order-gate';
import { OrderSummary } from '../order-summary';
import { ReservationTimer } from '../reservation-timer';
import { ConfirmForm } from './confirm-form';

export const metadata: Metadata = {
  title: 'Récapitulatif',
  robots: { index: false, follow: false },
};

/**
 * Écran A2 — récapitulatif.
 *
 * Transparence totale : chaque franc est nommé. C'est l'écran qui décide de la
 * confiance, et la surprise sur le montant est la première cause d'abandon
 * relevée par le prototype.
 */
export default async function CheckoutSummaryPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const gate = await loadOrder(reference.toUpperCase());

  if (gate.kind === 'terminal') return gate.render;

  const { order } = gate;

  // Sans coordonnées, il n'y a rien à récapituler : on renvoie à l'étape qui
  // les collecte plutôt que d'afficher un écran à moitié vide.
  if (!order.buyerPhone || !order.buyerName) {
    redirect(`/checkout/${order.reference}/billets`);
  }

  return (
    <>
      <CheckoutStepper reference={order.reference} current="recapitulatif" />

      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-display text-h2 font-bold tracking-[-0.02em]">Récapitulatif</h1>
            <span className="tabular text-micro text-text-3">{order.reference}</span>
          </div>
          {order.expiresAt ? <ReservationTimer expiresAt={order.expiresAt} /> : null}
        </header>

        <OrderSummary order={order} changeHref={`/checkout/${order.reference}/billets`} />

        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3">
            <h2 className="text-body font-bold">Livraison des billets</h2>
          </div>
          <dl className="flex flex-col gap-2 px-5 py-4">
            <Row label="Nom" value={order.buyerName} />
            <Row label="Téléphone" value={order.buyerPhone} />
            {order.buyerEmail ? <Row label="E-mail" value={order.buyerEmail} /> : null}
          </dl>
        </Surface>

        <ConfirmForm order={order} />
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-s text-text-2">{label}</dt>
      <dd className="text-body-s font-semibold">{value}</dd>
    </div>
  );
}
