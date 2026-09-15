import Link from 'next/link';
import type { Order } from '@nexakabi/contracts';
import { Money, Surface } from '@nexakabi/ui';
import { formatEventCaptionWithTime } from '@nexakabi/utils';

/**
 * Rappel de la commande.
 *
 * Présent à chaque étape, avec le même montant partout : le prototype impose
 * que le total affiché au récapitulatif soit exactement celui vu sur la carte
 * d'événement, puis exactement celui débité. Un écart, même de cent francs,
 * détruit la confiance sur ce marché.
 */
export function OrderSummary({
  order,
  changeHref,
  showBreakdown = true,
}: {
  order: Order;
  /** Lien de retour pour modifier la sélection. */
  changeHref?: string;
  showBreakdown?: boolean;
}) {
  const ticketCount = order.items.reduce((total, item) => total + item.quantity, 0);

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4">
        <p className="eyebrow text-text-3">
          {formatEventCaptionWithTime(new Date(order.eventStartsAt))}
        </p>
        <h2 className="mt-0.5 text-h3 font-bold">{order.eventTitle}</h2>
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

      {showBreakdown ? (
        <dl className="flex flex-col gap-2 px-5 py-4">
          <Line label={`Sous-total · ${ticketCount} billet${ticketCount > 1 ? 's' : ''}`}>
            <Money amount={order.subtotalAmount} size="small" />
          </Line>

          {order.discountAmount > 0 ? (
            <Line label="Réduction">
              <Money amount={-order.discountAmount} size="small" showSign />
            </Line>
          ) : null}

          {/* Les frais sont nommés et chiffrés. Jamais « frais divers ». */}
          <Line label="Frais de service Nexa-Kabi">
            <Money amount={order.buyerFeeAmount} size="small" />
          </Line>

          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="text-body font-bold">Total à payer</dt>
            <dd>
              {/* 32 px : c'est le chiffre que l'acheteur doit retenir. */}
              <Money amount={order.totalAmount} size="hero" />
            </dd>
          </div>
        </dl>
      ) : null}

      {changeHref ? (
        <div className="border-t border-border-subtle px-5 py-3">
          <Link
            href={changeHref}
            className="text-body-s font-semibold text-text-2 hover:text-text-strong"
          >
            ← Modifier ma sélection
          </Link>
        </div>
      ) : null}
    </Surface>
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
