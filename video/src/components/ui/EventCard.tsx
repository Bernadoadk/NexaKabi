import React from 'react';
import { config } from '../../config';
import type { DemoEvent } from '../../config.types';
import { formatAmount, formatEventCaptionWithTime, parseDate, serviceFee } from '../../lib/format';
import { cn } from '../../lib/layout';
import { Badge } from './Badge';
import { EventCover } from './EventCover';
import { Money } from './Money';

/**
 * Cartes d'événement — copies de `packages/ui/src/components/event-card.tsx`
 * (variantes « large » et « standard »), avec les visuels dessinés.
 */

const Cover: React.FC<{ event: DemoEvent; className?: string; children?: React.ReactNode }> = ({
  event,
  className,
  children,
}) => (
  <div className={cn('overflow-hidden bg-ink', className ?? 'relative')}>
    <div
      className="absolute inset-0 flex items-center justify-center px-4 text-center"
      style={{ background: config.categories[event.category].color }}
    />
    <EventCover event={event} />
    {children}
  </div>
);

/** « 5 000 FCFA + 250 de frais » — les frais annoncés dès la carte. */
export const PriceLabel: React.FC<{
  event: DemoEvent;
  className?: string;
  feeClassName?: string;
}> = ({ event, className, feeClassName }) => {
  if (event.price === 0) {
    return (
      <Badge tone="accent" className={cn('self-start', className)}>
        Gratuit
      </Badge>
    );
  }

  return (
    <span className={cn('flex items-baseline gap-1.5', className)}>
      <Money amount={event.price} size="default" hideSymbol />
      <span className={cn('text-[12px] text-text-2', feeClassName)}>
        FCFA + {formatAmount(serviceFee(event.price))} de frais
      </span>
    </span>
  );
};

const StatusBadge: React.FC<{ event: DemoEvent }> = ({ event }) =>
  event.almostSoldOut ? <Badge tone="overlay-accent">Bientôt complet</Badge> : null;

const where = (event: DemoEvent) => [event.venue, event.city].filter(Boolean).join(' · ');

/** Variante large : visuel plein cadre, dégradé encre, texte superposé. */
export const EventCardLarge: React.FC<{
  event: DemoEvent;
  className?: string;
  style?: React.CSSProperties;
}> = ({ event, className, style }) => (
  <div
    className={cn('relative block h-[330px] overflow-hidden rounded-panel shadow-md', className)}
    style={style}
  >
    <Cover event={event} className="absolute inset-0" />
    <div className="ink-scrim absolute inset-0" />

    <div className="absolute left-3.5 top-3.5 flex gap-1.5">
      <Badge tone="overlay">{config.categories[event.category].name}</Badge>
      <StatusBadge event={event} />
    </div>

    <div className="absolute inset-x-4 bottom-4 flex flex-col gap-1.5 text-white">
      <div className="eyebrow text-coral-200">
        {formatEventCaptionWithTime(parseDate(event.start))}
      </div>
      <h3 className="font-display text-[23px] font-bold leading-tight tracking-[-0.02em]">
        {event.title}
      </h3>
      <p className="text-body-s text-on-ink-soft">{where(event)}</p>
      <PriceLabel event={event} className="mt-1 text-white" feeClassName="text-on-ink-soft" />
    </div>
  </div>
);

/** Variante standard : visuel 16:9 de 132 px, corps blanc, pied prix / places. */
export const EventCardStandard: React.FC<{
  event: DemoEvent;
  className?: string;
  style?: React.CSSProperties;
  /** Mise en avant animée du badge « Bientôt complet » (0 → 1). */
  highlight?: number;
}> = ({ event, className, style, highlight = 0 }) => (
  <div
    className={cn(
      'block overflow-hidden rounded-[16px] border border-border bg-surface',
      className,
    )}
    style={style}
  >
    <Cover event={event} className="relative h-[132px]">
      <div className="absolute right-2.5 top-2.5 flex gap-1.5">
        <Badge tone="overlay">{config.categories[event.category].name}</Badge>
        {event.almostSoldOut ? (
          <Badge
            tone="overlay-accent"
            style={{
              transform: `scale(${1 + highlight * 0.12})`,
              boxShadow: highlight
                ? `0 0 0 ${highlight * 6}px rgba(255,77,46,${0.25 * highlight})`
                : undefined,
            }}
          >
            Bientôt complet
          </Badge>
        ) : null}
      </div>
    </Cover>

    <div className="flex flex-col gap-1.5 px-3.5 pb-4 pt-3.5">
      <div className="text-caption font-bold uppercase tracking-[0.1em] text-coral">
        {formatEventCaptionWithTime(parseDate(event.start))}
      </div>
      <h3 className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-text-strong">
        {event.title}
      </h3>
      <p className="text-body-s text-text-2">{where(event)}</p>
      <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle pt-2.5">
        <PriceLabel event={event} />
        {event.remainingSeats !== undefined ? (
          <span className="text-micro text-text-3">{event.remainingSeats} places</span>
        ) : null}
      </div>
    </div>
  </div>
);
