import React from 'react';
import { X } from 'lucide-react';
import { config } from '../config';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EventCover } from '../components/ui/EventCover';
import { Money } from '../components/ui/Money';
import { StatusSpacer } from '../components/motion/Frames';
import { interpolate } from 'remotion';
import { CLAMP, EASE_OUT } from '../lib/anim';
import {
  formatAmount,
  formatEventRange,
  formatTimeSpaced,
  heroEvent,
  parseDate,
  serviceFee,
} from '../lib/format';
import { cn } from '../lib/layout';
import { PublicHeader } from './shared';

/**
 * Page événement, mobile (`components/event-page-view.tsx`, écran P4), avec sa
 * barre d'achat fixe. La feuille de sélection des billets (`TicketSheet`) se
 * pose par-dessus.
 */
export const EventScreen: React.FC<{ buyPress?: number; children?: React.ReactNode }> = ({
  buyPress = 0,
  children,
}) => {
  const event = heroEvent();
  const start = parseDate(event.start);
  const end = parseDate(event.end);

  return (
    <div className="relative h-full overflow-hidden bg-paper">
      <StatusSpacer />
      <PublicHeader />

      <section className="relative h-[280px] overflow-hidden bg-ink">
        <div
          className="absolute inset-0"
          style={{ background: config.categories[event.category].color }}
        >
          <EventCover event={event} />
        </div>
        <div className="ink-scrim absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 px-5 pb-6 text-white">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="overlay-accent">{config.categories[event.category].name}</Badge>
            {event.almostSoldOut ? <Badge tone="overlay">Bientôt complet</Badge> : null}
          </div>
          <h1 className="m-0 font-display text-h1 font-bold tracking-[-0.035em]">{event.title}</h1>
          <p className="m-0 text-[14.5px] leading-snug text-on-ink-soft">
            {formatEventRange(start, end)} · {event.venue}, {event.city}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-8 px-5 py-8">
        <section className="flex flex-col gap-3">
          <h2 className="m-0 font-display text-h2 font-bold">À propos</h2>
          <p className="m-0 text-body-l text-text-strong">{config.data.heroEventDescription}</p>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="m-0 font-display text-h2 font-bold">Bon à savoir</h2>
          <dl className="m-0 grid gap-y-3">
            <Info
              label="Ouverture des portes"
              value={formatTimeSpaced(parseDate(config.data.doorsOpen))}
            />
            <Info label="Remboursement" value={config.data.refundPolicy} />
          </dl>
        </section>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-border bg-surface px-5 pb-[24px] pt-3 shadow-sheet">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <span className="flex items-baseline gap-1.5">
              <Money amount={event.price} size="default" hideSymbol />
              <span className="text-[12px] text-text-2">
                FCFA + {formatAmount(serviceFee(event.price))} de frais
              </span>
            </span>
          </div>
          <Button variant="primary" size="primary" press={buyPress}>
            Obtenir un billet
          </Button>
        </div>
      </div>

      {children}
    </div>
  );
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 border-b border-border-subtle pb-2">
    <dt className="text-micro text-text-3">{label}</dt>
    <dd className="m-0 text-body font-semibold">{value}</dd>
  </div>
);

/**
 * Feuille de sélection des billets (`app/(public)/e/[slug]/ticket-picker.tsx`).
 * Les frais s'affichent dès qu'un billet est choisi, jamais au paiement.
 */
export const TicketSheet: React.FC<{
  /** Ouverture de la feuille (0 → 1). */
  open: number;
  /** Quantité de Pass Standard (peut être fractionnaire pendant l'animation). */
  quantity: number;
  /** Progression du défilement des montants (0 → 1) entre l'ancienne et la nouvelle quantité. */
  amountProgress: number;
  previousQuantity: number;
  plusPress?: number;
  continuePress?: number;
  continueLoading?: boolean;
}> = ({
  open,
  quantity,
  amountProgress,
  previousQuantity,
  plusPress = 0,
  continuePress = 0,
  continueLoading = false,
}) => {
  const [standard, vip] = config.data.tickets;
  const count = Math.round(quantity);
  const shown = (value: number, previousValue: number) =>
    Math.round(
      interpolate(amountProgress, [0, 1], [previousValue, value], { ...CLAMP, easing: EASE_OUT }) /
        50,
    ) * 50;
  const subtotal = count * standard.price;
  const previousSubtotal = previousQuantity * standard.price;

  return (
    <>
      <div
        className="absolute inset-0 z-30"
        style={{ background: `rgba(18, 16, 43, ${0.4 * open})` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 z-40 rounded-t-sheet bg-surface shadow-sheet"
        style={{ transform: `translateY(${(1 - open) * 105}%)` }}
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="m-0 text-h3 font-bold">Billets</h2>
          <span className="grid size-8 place-items-center rounded-full text-text-2">
            <X className="size-4" />
          </span>
        </div>

        <ul className="m-0 flex list-none flex-col p-0">
          {[standard, vip].map((ticket, index) => {
            const value = index === 0 ? count : 0;
            return (
              <li
                key={ticket.name}
                className="flex flex-col gap-2 border-b border-border-subtle px-5 py-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body font-bold">{ticket.name}</span>
                  <Money amount={ticket.price} size="default" />
                </div>
                <p className="m-0 text-body-s text-text-2">{ticket.description}</p>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="success">En vente</Badge>
                    <span className="text-micro text-text-3">{ticket.remaining} places</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <StepperButton disabled={value === 0}>−</StepperButton>
                    <span className="tabular w-8 text-center text-body font-bold">{value}</span>
                    <StepperButton press={index === 0 ? plusPress : 0}>+</StepperButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-3 p-5 pb-[26px]">
          {count > 0 ? (
            <dl className="m-0 flex flex-col gap-1.5 rounded-card bg-surface-alt px-4 py-3">
              <Row label={`Billets (${count})`} amount={shown(subtotal, previousSubtotal)} />
              <Row
                label="Frais de service"
                amount={shown(serviceFee(subtotal), serviceFee(previousSubtotal))}
              />
              <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle pt-2">
                <dt className="text-body font-bold">Total</dt>
                <dd className="m-0">
                  <Money
                    amount={shown(
                      subtotal + serviceFee(subtotal),
                      previousSubtotal + serviceFee(previousSubtotal),
                    )}
                    size="default"
                  />
                </dd>
              </div>
            </dl>
          ) : null}
          <Button
            variant="primary"
            size="primary"
            block
            disabled={count === 0}
            press={continuePress}
            loading={continueLoading}
          >
            {count === 0 ? 'Choisis tes billets' : 'Continuer'}
          </Button>
        </div>
      </div>
    </>
  );
};

const Row: React.FC<{ label: string; amount: number }> = ({ label, amount }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-body-s text-text-2">{label}</dt>
    <dd className="m-0">
      <Money amount={amount} size="small" />
    </dd>
  </div>
);

const StepperButton: React.FC<{
  disabled?: boolean;
  press?: number;
  children: React.ReactNode;
}> = ({ disabled = false, press = 0, children }) => (
  <span
    className={cn(
      'grid size-9 place-items-center rounded-field border bg-surface text-body font-bold text-text',
      press > 0 ? 'border-text-strong' : 'border-border',
      disabled && 'opacity-40',
    )}
    style={{ transform: `scale(${1 - press * 0.12})` }}
  >
    {children}
  </span>
);
