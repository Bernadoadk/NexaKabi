import React from 'react';
import { Check, Lock, Timer } from 'lucide-react';
import { config } from '../config';
import { Alert, BrandMark, PaymentLogo, Wordmark } from '../components/ui/Basics';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { StatusSpacer } from '../components/motion/Frames';
import { formatEventCaptionWithTime, heroEvent, parseDate, serviceFee } from '../lib/format';
import { cn } from '../lib/layout';
import { useTime } from '../lib/time';

const METHODS = [
  {
    code: 'mtn',
    label: 'MTN MoMo',
    description: 'Validation par code USSD',
    group: 'mobile_money',
  },
  {
    code: 'moov',
    label: 'Moov Money',
    description: 'Validation par code USSD',
    group: 'mobile_money',
  },
  {
    code: 'card',
    label: 'Carte bancaire',
    description: 'Visa · Mastercard · paiement sécurisé',
    group: 'card',
  },
] as const;

export type MethodCode = (typeof METHODS)[number]['code'];

/**
 * Paiement, mobile (`app/(checkout)/checkout/[reference]/paiement/`, écran A3) :
 * progression du tunnel, récapitulatif, moyens du Bénin (MTN MoMo, Moov Money,
 * carte), bouton « Payer ». La fenêtre de paiement du prestataire, elle, n'est
 * pas reproduite.
 */
export const PaymentScreen: React.FC<{
  scroll?: number;
  /** Progression des pastilles du tunnel (0 → 1 : étapes 1 et 2 cochées). */
  steps?: number;
  selected?: MethodCode | null;
  selectPress?: number;
  payPress?: number;
  paying?: boolean;
  /** Nombre de Pass Standard de la commande (par défaut `config.data.quantity`). */
  quantity?: number;
  /** Référence de la commande (par défaut `config.data.orderReference`). */
  orderReference?: string;
}> = ({
  scroll = 0,
  steps = 1,
  selected = null,
  selectPress = 0,
  payPress = 0,
  paying = false,
  quantity = config.data.quantity,
  orderReference = config.data.orderReference,
}) => {
  const time = useTime();
  const event = heroEvent();
  const [standard] = config.data.tickets;
  const subtotal = quantity * standard.price;
  const fee = serviceFee(subtotal);
  const total = subtotal + fee;
  // Le compte à rebours de la réservation (30 min) défile pendant la scène.
  const remaining = 29 * 60 + 12 - Math.floor(Math.max(0, time) / config.fps);
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div className="relative h-full overflow-hidden bg-paper">
      <div className="absolute inset-x-0 top-0 z-20">
        <StatusSpacer />
        <header className="flex h-[62px] items-center justify-between border-b border-border bg-surface px-5">
          <div className="flex items-center gap-1 text-text">
            <BrandMark size={36} />
            <Wordmark className="text-[19px]" />
          </div>
          <span className="flex items-center gap-1.5 text-micro text-text-3">
            <Lock className="size-3.5" /> Paiement sécurisé
          </span>
        </header>
      </div>

      <div className="px-5 pt-[120px]" style={{ transform: `translateY(${-scroll}px)` }}>
        <CheckoutStepper progress={steps} />

        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="m-0 font-display text-h2 font-bold tracking-[-0.02em]">Paiement</h1>
              <span className="tabular text-micro text-text-3">{orderReference}</span>
            </div>
            <p className="m-0 flex items-center gap-1.5 text-micro text-text-3">
              <Timer className="size-3.5" />
              Places réservées encore <span className="tabular">{clock}</span>
            </p>
          </header>

          <div className="overflow-hidden rounded-panel border border-border bg-surface">
            <div className="border-b border-border-subtle px-5 py-4">
              <p className="eyebrow m-0 text-text-3">
                {formatEventCaptionWithTime(parseDate(event.start))}
              </p>
              <h2 className="m-0 mt-0.5 text-h3 font-bold">{event.title}</h2>
              <p className="m-0 mt-0.5 text-body-s text-text-2">
                {event.venue} · {event.city}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle px-5 py-3">
              <span className="text-body-s">
                <span className="font-semibold">{quantity} ×</span> {standard.name}
              </span>
              <Money amount={subtotal} size="small" />
            </div>
            <dl className="m-0 flex flex-col gap-2 px-5 py-4">
              <Line label={`Sous-total · ${quantity} billets`}>
                <Money amount={subtotal} size="small" />
              </Line>
              <Line label={`Frais de service ${config.brand.name}`}>
                <Money amount={fee} size="small" />
              </Line>
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="text-body font-bold">Total à payer</dt>
                <dd className="m-0">
                  <Money amount={total} size="hero" />
                </dd>
              </div>
            </dl>
          </div>

          <div className="overflow-hidden rounded-panel border border-border bg-surface">
            <div className="flex items-baseline justify-between border-b border-border-subtle px-5 py-4">
              <h2 className="m-0 text-body font-bold">Mobile Money</h2>
              <span className="text-micro text-text-3">Recommandé</span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {METHODS.filter((method) => method.group === 'mobile_money').map((method, index) => (
                <MethodRow
                  key={method.code}
                  method={method}
                  active={selected === method.code}
                  press={selected === method.code ? selectPress : 0}
                  recommended={index === 0}
                />
              ))}
            </ul>
            <div className="border-y border-border-subtle bg-surface-alt px-5 py-2.5">
              <h2 className="m-0 text-body-s font-bold text-text-2">Autres moyens</h2>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {METHODS.filter((method) => method.group !== 'mobile_money').map((method) => (
                <MethodRow key={method.code} method={method} active={selected === method.code} />
              ))}
            </ul>
          </div>

          <Alert tone="info" title="Paiement dans une fenêtre sécurisée">
            La fenêtre de paiement s’ouvre sur cette page : tu y saisis ton numéro, puis tu valides
            sur ton téléphone.
          </Alert>

          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              size="primary"
              block
              press={payPress}
              loading={paying}
              disabled={!selected}
            >
              Payer <Money amount={total} size="small" className="ml-1" />
            </Button>
            <p className="m-0 flex items-start gap-2 rounded-card bg-surface-alt px-4 py-3 text-micro text-text-2">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              {config.brand.name} ne demande jamais ton code secret. Tu valides le paiement
              directement sur ton téléphone, chez ton opérateur.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const MethodRow: React.FC<{
  method: (typeof METHODS)[number];
  active: boolean;
  press?: number;
  recommended?: boolean;
}> = ({ method, active, press = 0, recommended = false }) => (
  <li>
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border-subtle px-4 py-3',
        active ? 'bg-coral-50' : 'bg-surface',
      )}
      style={{ transform: press ? `scale(${1 - press * 0.02})` : undefined }}
    >
      <PaymentLogo logo={method.code} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body font-semibold">{method.label}</span>
          {recommended ? <Badge tone="accent">Recommandé</Badge> : null}
        </span>
        <span className="text-micro text-text-3">{method.description}</span>
      </span>
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          active ? 'border-coral bg-coral text-white' : 'border-border-strong',
        )}
      >
        {active ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
    </div>
  </li>
);

const Line: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-body-s text-text-2">{label}</dt>
    <dd className="m-0">{children}</dd>
  </div>
);

/** Les trois étapes du tunnel (`stepper.tsx`) ; libellés masqués sur mobile, comme dans l'app. */
const CheckoutStepper: React.FC<{ progress: number }> = ({ progress }) => {
  const labels = ['Billets', 'Récapitulatif', 'Paiement'];
  return (
    <nav className="mb-6">
      <ol className="m-0 flex list-none items-center gap-2 p-0">
        {labels.map((label, index) => {
          const done = index < 2 && progress >= (index + 1) / 2;
          const active = index === 2;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-micro font-bold',
                  done && 'bg-mint text-ink',
                  active && 'bg-ink text-white',
                  !done && !active && 'bg-fill-neutral text-text-3',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
              {index < labels.length - 1 ? (
                <span className={cn('h-px flex-1', done ? 'bg-mint' : 'bg-border')} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
