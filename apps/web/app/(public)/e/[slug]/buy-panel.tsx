'use client';

import * as React from 'react';
import type { TicketTypeView } from '@nexakabi/contracts';
import { Badge, Button, Money, Surface } from '@nexakabi/ui';
import { TicketPicker } from './ticket-picker';

/**
 * Achat, dans ses deux formes.
 *
 * À partir de 1024 px, la sélection tient dans le panneau latéral collant. En
 * dessous, elle s'ouvre en feuille depuis la barre d'achat fixe : le prototype
 * demande que le prix et l'appel à l'action restent visibles sans défilement,
 * et que la sélection ne fasse pas quitter la page.
 */

export interface BuyPanelProps {
  eventId: string;
  ticketTypes: TicketTypeView[];
  maxTicketsPerOrder: number | null;
  cancelled: boolean;
  soldOut: boolean;
  fromPrice: number | null;
  feeAmount: number | null;
}

export function BuyPanel(props: BuyPanelProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const blocked = props.cancelled || props.soldOut;

  // La feuille prend tout l'écran : le défilement de la page derrière elle
  // désorienterait, et laisserait croire que le geste n'a pas été pris en compte.
  React.useEffect(() => {
    if (!sheetOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  React.useEffect(() => {
    if (!sheetOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSheetOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen]);

  return (
    <>
      {/* Panneau latéral collant, à partir du palier desktop. */}
      <aside className="hidden lg:sticky lg:top-[86px] lg:block">
        <Surface
          variant="panel"
          padding="none"
          className="max-h-[calc(100dvh-110px)] overflow-y-auto"
        >
          {blocked ? (
            <BlockedPanel cancelled={props.cancelled} />
          ) : (
            <TicketPicker
              eventId={props.eventId}
              ticketTypes={props.ticketTypes}
              maxTicketsPerOrder={props.maxTicketsPerOrder}
            />
          )}
        </Surface>
      </aside>

      {/* Barre d'achat fixe en mobile. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-5 py-3 shadow-sheet lg:hidden">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4">
          <div className="flex-1">
            <PriceLine fromPrice={props.fromPrice} feeAmount={props.feeAmount} />
          </div>
          <Button
            variant="primary"
            size="primary"
            disabled={blocked}
            onClick={() => setSheetOpen(true)}
          >
            {props.cancelled ? 'Annulé' : props.soldOut ? 'Complet' : 'Obtenir un billet'}
          </Button>
        </div>
      </div>

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <button
            type="button"
            aria-label="Fermer la sélection"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choisir ses billets"
            className="relative max-h-[86vh] overflow-y-auto rounded-t-sheet bg-surface shadow-sheet"
          >
            {/* Poignée de préhension : indique que la feuille se referme. */}
            <div className="sticky top-0 z-10 flex justify-center bg-surface pt-2.5">
              <span className="h-1 w-10 rounded-full bg-border" />
            </div>

            <TicketPicker
              eventId={props.eventId}
              ticketTypes={props.ticketTypes}
              maxTicketsPerOrder={props.maxTicketsPerOrder}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function BlockedPanel({ cancelled }: { cancelled: boolean }) {
  return (
    <div className="flex flex-col gap-3 p-5">
      <h2 className="text-h3 font-bold">Billets</h2>
      <p className="text-body-s text-text-2">
        {cancelled
          ? 'Cet événement a été annulé. Les acheteurs sont remboursés automatiquement.'
          : 'Toutes les places ont trouvé preneur.'}
      </p>
      <Button variant="primary" size="primary" block disabled>
        {cancelled ? 'Événement annulé' : 'Complet'}
      </Button>
    </div>
  );
}

function PriceLine({
  fromPrice,
  feeAmount,
}: {
  fromPrice: number | null;
  feeAmount: number | null;
}) {
  if (fromPrice === null) return <span className="text-body-s text-text-2">Sur invitation</span>;
  if (fromPrice === 0) return <Badge tone="accent">Gratuit</Badge>;

  return (
    <span className="flex items-baseline gap-1.5">
      <Money amount={fromPrice} size="default" hideSymbol />
      <span className="text-[12px] text-text-2">
        FCFA{feeAmount ? ` + ${feeAmount} de frais` : ''}
      </span>
    </span>
  );
}
