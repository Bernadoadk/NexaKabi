'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  computeFeeBreakdown,
  maxPurchasableQuantity,
  type ApiError,
  type Order,
  type TicketTypeView,
} from '@nexakabi/contracts';
import { Alert, Badge, Button, Money } from '@nexakabi/ui';

/**
 * Sélection des billets.
 *
 * Trois exigences du prototype, toutes visibles ici :
 *   · les frais apparaissent DÈS la sélection, jamais au moment de payer ;
 *   · le montant affiché ici est celui qui sera débité, au franc près ;
 *   · sur mobile, la sélection s'ouvre en feuille depuis la barre d'achat fixe,
 *     sans quitter la page événement.
 *
 * Voir docs/PROJECT_ANALYSIS.md §6.1.
 */

export interface TicketPickerProps {
  eventId: string;
  ticketTypes: TicketTypeView[];
  maxTicketsPerOrder: number | null;
  /** Bouton de fermeture, présent uniquement quand le sélecteur est en feuille. */
  onClose?: () => void;
}

export function TicketPicker({
  eventId,
  ticketTypes,
  maxTicketsPerOrder,
  onClose,
}: TicketPickerProps) {
  const router = useRouter();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const lines = ticketTypes
    .map((ticket) => ({ ticket, quantity: quantities[ticket.id] ?? 0 }))
    .filter((line) => line.quantity > 0);

  const breakdown = computeFeeBreakdown({
    lines: lines.map((line) => ({ unitPrice: line.ticket.price, quantity: line.quantity })),
  });

  const ticketCount = lines.reduce((total, line) => total + line.quantity, 0);
  const overallLimit = maxTicketsPerOrder ?? Infinity;

  async function submit() {
    setPending(true);
    setError(null);

    const response = await fetch('/api/checkout/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        lines: lines.map((line) => ({ ticketTypeId: line.ticket.id, quantity: line.quantity })),
      }),
    });

    const payload: unknown = await response.json();

    if (!response.ok) {
      setPending(false);
      setError((payload as ApiError).message);
      // Les places ont pu partir pendant la sélection : on rafraîchit les
      // compteurs pour que l'écran dise la vérité.
      router.refresh();
      return;
    }

    router.push(`/checkout/${(payload as Order).reference}/billets`);
  }

  return (
    <div className="flex flex-col">
      {/* En-tête et pied collants : quand l'événement propose beaucoup de
          catégories, la liste défile mais le total et l'action restent lisibles.
          Sans cela, le bouton principal sortait de l'écran sur un portable de
          faible hauteur — le panneau latéral étant lui-même collant. */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-surface px-5 py-4">
        <h2 className="text-h3 font-bold">Billets</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-text-2 transition hover:bg-surface-alt"
            aria-label="Fermer la sélection"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <ul className="flex flex-col">
        {ticketTypes.map((ticket) => {
          const max = maxPurchasableQuantity({
            remaining: ticket.remaining,
            maxPerOrder: ticket.maxPerOrder,
            eventMaxTicketsPerOrder: maxTicketsPerOrder,
          });

          const quantity = quantities[ticket.id] ?? 0;
          // Le plafond global de l'événement se partage entre les catégories.
          const headroom = Math.min(max, quantity + Math.max(0, overallLimit - ticketCount));

          return (
            <li
              key={ticket.id}
              className="flex flex-col gap-2 border-b border-border-subtle px-5 py-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body font-bold">{ticket.name}</span>
                {ticket.price === 0 ? (
                  <Badge tone="accent">Gratuit</Badge>
                ) : (
                  <Money amount={ticket.price} size="default" />
                )}
              </div>

              {ticket.description ? (
                <p className="text-body-s text-text-2">{ticket.description}</p>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge tone={ticket.available ? 'success' : 'neutral'}>
                    {ticket.availabilityLabel}
                  </Badge>
                  {ticket.available ? (
                    <span className="text-micro text-text-3">{ticket.remaining} places</span>
                  ) : null}
                </div>

                {ticket.available ? (
                  <Stepper
                    value={quantity}
                    min={0}
                    max={headroom}
                    step={quantity === 0 ? ticket.minPerOrder : 1}
                    label={ticket.name}
                    onChange={(next) =>
                      setQuantities((current) => ({ ...current, [ticket.id]: next }))
                    }
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-border-subtle bg-surface p-5">
        {error ? (
          <Alert tone="danger" title="Sélection impossible">
            {error}
          </Alert>
        ) : null}

        {ticketCount > 0 ? (
          /* Les frais sont annoncés ici, pas au moment de payer : c'est la
             règle de transparence du prototype. */
          <dl className="flex flex-col gap-1.5 rounded-card bg-surface-alt px-4 py-3">
            <Row label={`Billets (${ticketCount})`} amount={breakdown.subtotalAmount} />
            <Row label="Frais de service" amount={breakdown.buyerFeeAmount} />
            <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle pt-2">
              <dt className="text-body font-bold">Total</dt>
              <dd>
                <Money amount={breakdown.totalAmount} size="default" />
              </dd>
            </div>
          </dl>
        ) : null}

        <Button
          variant="primary"
          size="primary"
          block
          loading={pending}
          disabled={ticketCount === 0}
          onClick={() => void submit()}
        >
          {ticketCount === 0 ? 'Choisis tes billets' : 'Continuer'}
        </Button>

        <p className="text-center text-micro text-text-3">
          Paiement Mobile Money · billet envoyé sur WhatsApp
        </p>
      </div>
    </div>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-s text-text-2">{label}</dt>
      <dd>
        <Money amount={amount} size="small" />
      </dd>
    </div>
  );
}

/**
 * Compteur de quantité.
 *
 * Cibles tactiles de 36 px : le prototype impose 44 px minimum pour une action
 * principale, et 36 px pour un contrôle secondaire répété — ce qui est le cas
 * ici, les deux boutons étant côte à côte.
 */
function Stepper({
  value,
  min,
  max,
  step,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <StepperButton
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - (value === step ? step : 1)))}
        aria-label={`Retirer un billet ${label}`}
      >
        −
      </StepperButton>

      <span className="tabular w-8 text-center text-body font-bold" aria-live="polite">
        {value}
      </span>

      <StepperButton
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value === 0 ? step : value + 1))}
        aria-label={`Ajouter un billet ${label}`}
      >
        +
      </StepperButton>
    </div>
  );
}

function StepperButton({
  children,
  disabled,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-field border border-border bg-surface text-body font-bold text-text transition hover:border-text-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border"
      {...props}
    >
      {children}
    </button>
  );
}
