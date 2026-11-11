import React from 'react';
import { Check } from 'lucide-react';
import { config } from '../config';
import { Button } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { ramp, SPRINGS, sp } from '../lib/anim';
import { formatEventCaptionWithTime, heroEvent, parseDate, serviceFee } from '../lib/format';
import { useTime } from '../lib/time';
import { StatusSpacer } from '../components/motion/Frames';
import { PublicHeader } from './shared';

/**
 * Confirmation (`app/(public)/commandes/[reference]/confirmation/`, écran A5) :
 * fond encre, pastille menthe, montant payé, billets émis sur-le-champ.
 */
export const ConfirmationScreen: React.FC<{
  appear: number;
  scroll?: number;
  /** Billets émis, un par ligne (par défaut : ceux de `config.data`). */
  tickets?: Array<{ name: string; reference: string }>;
  /**
   * Mention de l'application sous la liste : « Un lien par billet… »
   * (`commandes/[reference]/confirmation/page.tsx`).
   */
  linkNote?: boolean;
  /** Mise en avant (0 → 1) de la ligne d'un billet, par son index. */
  highlight?: { index: number; amount: number };
  /** Référence de la commande (par défaut `config.data.orderReference`). */
  orderReference?: string;
}> = ({
  appear,
  scroll = 0,
  tickets: given,
  linkNote = false,
  highlight,
  orderReference = config.data.orderReference,
}) => {
  const time = useTime();
  const event = heroEvent();
  const [standard] = config.data.tickets;
  const tickets = (
    given ?? [
      { name: config.data.buyer.name, reference: `${config.data.orderReference}-01` },
      { name: 'Sèna Dossou', reference: `${config.data.orderReference}-02` },
    ]
  ).slice(0, given ? undefined : config.data.quantity);
  const quantity = given ? given.length : config.data.quantity;
  const subtotal = quantity * standard.price;
  const fee = serviceFee(subtotal);
  const total = subtotal + fee;

  const check = sp(time, appear + 1, SPRINGS.pop);
  const title = sp(time, appear + 4, SPRINGS.snappy);
  const card = sp(time, appear + 7, SPRINGS.smooth);
  const counted = Math.round(ramp(time, appear + 8, appear + 30) * total);

  return (
    <div className="relative h-full overflow-hidden bg-ink text-white">
      <div className="relative z-20 text-text">
        <StatusSpacer />
        <PublicHeader />
      </div>
      <div
        className="relative z-0 flex flex-col gap-6 px-5 pt-10"
        style={{ transform: `translateY(${-scroll}px)` }}
      >
        <header className="flex flex-col items-center gap-3 text-center">
          <span
            className="grid size-14 place-items-center rounded-full bg-mint text-ink"
            style={{ transform: `scale(${check})` }}
          >
            <Check className="size-6" strokeWidth={3} />
          </span>
          <div
            className="flex flex-col gap-1"
            style={{ opacity: title, transform: `translateY(${(1 - title) * 14}px)` }}
          >
            <h1 className="m-0 font-display text-h1 font-bold tracking-[-0.02em]">
              C’est confirmé
            </h1>
            <p className="m-0 text-body text-white/70">
              {quantity} billets pour {event.title}
            </p>
          </div>
        </header>

        <section
          className="rounded-panel bg-white/[0.06] p-5"
          style={{ opacity: card, transform: `translateY(${(1 - card) * 24}px)` }}
        >
          <dl className="m-0 flex flex-col gap-3">
            <Row label="Référence">
              <span className="tabular font-bold">{orderReference}</span>
            </Row>
            <Row label="Date">
              <span className="font-semibold">
                {formatEventCaptionWithTime(parseDate(event.start))}
              </span>
            </Row>
            <Row label="Lieu">
              <span className="font-semibold">{event.venue}</span>
            </Row>
            <div className="my-1 h-px bg-white/12" />
            <Row label={`${quantity} × ${standard.name}`}>
              <Money amount={subtotal} size="small" className="text-white" hideSymbol />
            </Row>
            <Row label="Frais de service">
              <Money amount={fee} size="small" className="text-white" hideSymbol />
            </Row>
            <div className="mt-1 flex items-baseline justify-between border-t border-white/12 pt-3">
              <dt className="text-body font-bold">Montant payé</dt>
              <dd className="m-0">
                <Money amount={counted} size="hero" className="text-white" />
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-panel border border-white/12 p-5" style={{ opacity: card }}>
          <h2 className="m-0 text-body font-bold">{quantity} billets émis</h2>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
            {tickets.map((ticket, index) => (
              <li
                key={ticket.reference}
                className="flex items-center justify-between gap-3 border-white/12 pt-2.5"
                style={{
                  borderTopWidth: index === 0 ? 0 : 1,
                  paddingTop: index === 0 ? 0 : undefined,
                  ...(highlight && highlight.index === index && highlight.amount > 0
                    ? {
                        background: `rgba(255, 77, 46, ${0.18 * highlight.amount})`,
                        boxShadow: `0 0 0 ${6 * highlight.amount}px rgba(255, 77, 46, ${0.18 * highlight.amount})`,
                        borderRadius: 8,
                      }
                    : null),
                }}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-body-s font-semibold">{ticket.name}</span>
                  <span className="tabular text-micro text-white/50">{ticket.reference}</span>
                </div>
                <Button variant="secondary" size="compact">
                  Voir le QR
                </Button>
              </li>
            ))}
          </ul>
          {linkNote ? (
            <p className="m-0 mt-3 text-micro text-white/60">
              Un lien par billet. Envoie-le à la personne concernée : elle n’aura pas besoin de
              compte.
            </p>
          ) : null}
        </section>

        <div className="flex flex-col gap-2.5">
          <Button variant="primary" size="primary" block>
            Voir mon premier billet
          </Button>
          <Button variant="secondary" size="primary" block>
            Envoyer sur WhatsApp
          </Button>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-body-s text-white/60">{label}</dt>
    <dd className="m-0 text-right text-body-s">{children}</dd>
  </div>
);
