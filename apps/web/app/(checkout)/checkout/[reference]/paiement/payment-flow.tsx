'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import {
  isPaymentPending,
  type ApiError,
  type Order,
  type PaymentMethod,
  type PaymentState,
  type PaymentProviderCode,
} from '@nexakabi/contracts';
import { formatShortCountdown } from '@nexakabi/utils';
import { Alert, Badge, Button, Field, Money, PhoneInput, Surface, cn } from '@nexakabi/ui';

/**
 * Paiement — écrans A3, A4 et A6.
 *
 * Une seule route, trois états, parce que c'est UN moment pour l'acheteur :
 * il choisit, il attend, il apprend le résultat. Le découper en trois pages
 * casserait le retour arrière et perdrait l'état d'attente au moindre
 * rafraîchissement.
 *
 * ── La règle qui gouverne cet écran ─────────────────────────────────────────
 * **Un paiement en attente n'est jamais présenté comme un échec.** Le Mobile
 * Money est asynchrone : l'acheteur quitte l'écran pour valider sur son
 * téléphone, la connexion peut tomber, l'onglet peut se fermer. Seul
 * l'opérateur tranche. Le compte à rebours n'annonce donc pas un échec — il
 * annonce le moment où la demande sera abandonnée par l'opérateur, ce qui n'est
 * pas la même chose et ne se dit pas de la même façon.
 */

/** Cadence d'interrogation. Assez rapide pour paraître instantané, assez lente
 *  pour ne pas marteler l'API pendant les trois minutes d'attente. */
const POLL_INTERVAL_MS = 3_000;

export function PaymentFlow({
  order,
  methods,
  notice,
  initialPayment,
}: {
  order: Order;
  methods: PaymentMethod[];
  notice: string;
  initialPayment: PaymentState | null;
}) {
  const router = useRouter();

  const [payment, setPayment] = React.useState<PaymentState | null>(initialPayment);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const available = methods.filter((method) => method.available);
  const [provider, setProvider] = React.useState<PaymentProviderCode | null>(
    initialPayment?.provider ?? available[0]?.provider ?? null,
  );
  const [payerPhone, setPayerPhone] = React.useState(order.buyerPhone);

  const waiting = payment !== null && isPaymentPending(payment.status);

  // Interrogation de l'état pendant l'attente. C'est le serveur qui interroge
  // l'opérateur : la page ne fait que demander le verdict connu.
  React.useEffect(() => {
    if (!payment || !isPaymentPending(payment.status)) return;

    let cancelled = false;

    const timer = window.setInterval(() => {
      void (async () => {
        const response = await fetch(
          `/api/checkout/orders/${order.reference}/payments/${payment.paymentId}`,
        );

        if (cancelled || !response.ok) return;

        const next = (await response.json()) as PaymentState;
        if (cancelled) return;

        setPayment(next);

        if (next.status === 'SUCCEEDED') {
          window.clearInterval(timer);
          router.push(`/commandes/${order.reference}/confirmation`);
        }
      })();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [payment, order.reference, router]);

  async function initiate() {
    if (!provider) return;

    setPending(true);
    setError(null);

    const response = await fetch(`/api/checkout/orders/${order.reference}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, payerPhone }),
    });

    const body: unknown = await response.json().catch(() => null);
    setPending(false);

    if (!response.ok) {
      setError((body as ApiError | null)?.message ?? 'Impossible de lancer le paiement.');
      return;
    }

    const state = body as PaymentState;
    setPayment(state);

    if (state.status === 'SUCCEEDED') {
      router.push(`/commandes/${order.reference}/confirmation`);
    }
  }

  if (waiting && payment) {
    return (
      <WaitingState
        payment={payment}
        onChangeMethod={() => {
          // On ne « annule » pas la demande en cours : elle peut encore
          // aboutir. Revenir au choix relancera simplement une demande, et le
          // serveur abandonnera la précédente à ce moment-là.
          setPayment(null);
          setError(null);
        }}
      />
    );
  }

  if (payment && payment.status !== 'SUCCEEDED') {
    return (
      <FailedState
        order={order}
        payment={payment}
        onRetry={() => {
          setPayment(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <ChooseState
      order={order}
      methods={methods}
      notice={notice}
      provider={provider}
      onProviderChange={setProvider}
      payerPhone={payerPhone}
      onPayerPhoneChange={setPayerPhone}
      error={error}
      pending={pending}
      onSubmit={() => void initiate()}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A3 · Choix du moyen de paiement
// ─────────────────────────────────────────────────────────────────────────────

function ChooseState({
  order,
  methods,
  notice,
  provider,
  onProviderChange,
  payerPhone,
  onPayerPhoneChange,
  error,
  pending,
  onSubmit,
}: {
  order: Order;
  methods: PaymentMethod[];
  notice: string;
  provider: PaymentProviderCode | null;
  onProviderChange: (provider: PaymentProviderCode) => void;
  payerPhone: string;
  onPayerPhoneChange: (phone: string) => void;
  error: string | null;
  pending: boolean;
  onSubmit: () => void;
}) {
  const mobileMoney = methods.filter((method) => method.group === 'mobile_money');
  const others = methods.filter((method) => method.group === 'other');
  const hasAvailable = methods.some((method) => method.available);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-5"
    >
      {error ? (
        <Alert tone="danger" title="Le paiement n’a pas pu démarrer">
          {error}
        </Alert>
      ) : null}

      {!hasAvailable ? (
        <Alert tone="warning" title="Aucun moyen de paiement disponible">
          Les paiements sont momentanément suspendus. Ta réservation reste valable — réessaie dans
          quelques minutes.
        </Alert>
      ) : null}

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="flex items-baseline justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-body font-bold">Mobile Money</h2>
          <span className="text-micro text-text-3">Recommandé</span>
        </div>

        <MethodList
          methods={mobileMoney}
          selected={provider}
          onSelect={onProviderChange}
          recommendedFirst
        />

        {others.length > 0 ? (
          <>
            <div className="border-y border-border-subtle bg-surface-alt px-5 py-2.5">
              <h2 className="text-body-s font-bold text-text-2">Autres moyens</h2>
            </div>
            <MethodList methods={others} selected={provider} onSelect={onProviderChange} />
          </>
        ) : null}
      </Surface>

      <Field
        label="Numéro à débiter"
        help="Souvent le tien, mais pas forcément : quelqu’un peut payer pour toi."
      >
        <PhoneInput
          defaultValue={payerPhone}
          onValueChange={(e164, raw) => onPayerPhoneChange(e164 ?? raw)}
        />
      </Field>

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          variant="primary"
          size="primary"
          block
          loading={pending}
          disabled={!provider || !hasAvailable}
        >
          Payer <Money amount={order.totalAmount} size="small" className="ml-1" />
        </Button>

        {/* Mention non négociable : c'est la protection la plus efficace contre
            l'ingénierie sociale sur ce marché. */}
        <p className="flex items-start gap-2 rounded-card bg-surface-alt px-4 py-3 text-micro text-text-2">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {notice}
        </p>
      </div>
    </form>
  );
}

function MethodList({
  methods,
  selected,
  onSelect,
  recommendedFirst = false,
}: {
  methods: PaymentMethod[];
  selected: PaymentProviderCode | null;
  onSelect: (provider: PaymentProviderCode) => void;
  recommendedFirst?: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {methods.map((method, index) => {
        const active = method.provider === selected;

        return (
          <li key={method.provider}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 border-b border-border-subtle px-5 py-3.5 transition',
                active && 'bg-coral-50',
                !method.available && 'cursor-not-allowed opacity-55',
              )}
            >
              <input
                type="radio"
                name="payment-method"
                value={method.provider}
                checked={active}
                disabled={!method.available}
                onChange={() => onSelect(method.provider)}
                className="size-[18px] shrink-0 accent-coral"
              />

              <span className="flex flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="text-body font-semibold">{method.label}</span>
                  {recommendedFirst && index === 0 && method.available ? (
                    <Badge tone="accent">Recommandé</Badge>
                  ) : null}
                  {method.comingSoon ? <Badge tone="neutral">Bientôt</Badge> : null}
                </span>
                <span className="text-micro text-text-3">{method.description}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A4 · Attente
// ─────────────────────────────────────────────────────────────────────────────

function WaitingState({
  payment,
  onChangeMethod,
}: {
  payment: PaymentState;
  onChangeMethod: () => void;
}) {
  const [remaining, setRemaining] = React.useState(() =>
    payment.expiresAt ? new Date(payment.expiresAt).getTime() - Date.now() : 0,
  );

  React.useEffect(() => {
    if (!payment.expiresAt) return;

    const target = new Date(payment.expiresAt).getTime();
    const timer = window.setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [payment.expiresAt]);

  const elapsed = payment.expiresAt ? Math.max(0, remaining) : 0;

  return (
    <div className="flex flex-col gap-5">
      <Surface variant="panel" className="flex flex-col items-center gap-4 py-8 text-center">
        <ProgressRing />

        <div className="flex flex-col gap-1">
          <h2 className="text-h3 font-bold">Valide le paiement sur ton téléphone</h2>
          <p className="text-body-s text-text-2">
            Une demande de <Money amount={payment.amount} size="small" /> a été envoyée au{' '}
            <span className="font-semibold">{payment.maskedPayerPhone}</span>.
          </p>
        </div>

        {payment.expiresAt ? (
          <p className="tabular text-body-s text-text-3">
            La demande expire dans{' '}
            <span className="font-bold">{formatShortCountdown(elapsed)}</span>
          </p>
        ) : null}

        {/* Ce qui compte le plus sur cet écran : dire que fermer la page ne
            casse rien. Sans cette phrase, l'acheteur inquiet recommence et
            risque un double paiement. */}
        <p className="max-w-[42ch] text-micro text-text-3">
          Tu peux fermer cette page sans risque : le paiement se poursuit, et tes billets
          t’attendront dans « Mes commandes ».
        </p>
      </Surface>

      {payment.instructions ? (
        <Alert tone="info" title="Tu n’as rien reçu ?">
          {payment.instructions}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" size="primary" block onClick={onChangeMethod}>
          Changer de numéro ou d’opérateur
        </Button>
        <Button asChild variant="tertiary" size="primary" block>
          <a
            href="https://wa.me/2290100000000"
            target="_blank"
            rel="noreferrer"
            className="text-center"
          >
            Contacter le support
          </a>
        </Button>
      </div>
    </div>
  );
}

/**
 * Anneau de progression.
 *
 * Rotation continue, sans pourcentage : afficher une progression chiffrée
 * mentirait, puisque personne ne sait quand l'acheteur composera son code.
 */
function ProgressRing() {
  return (
    <span
      role="status"
      aria-label="Paiement en cours de validation"
      className="relative grid size-16 place-items-center"
    >
      <svg viewBox="0 0 48 48" className="size-16 animate-spin [animation-duration:1.6s]">
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-border"
        />
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="34 92"
          className="text-coral"
        />
      </svg>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A6 · Échec
// ─────────────────────────────────────────────────────────────────────────────

function FailedState({
  order,
  payment,
  onRetry,
}: {
  order: Order;
  payment: PaymentState;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Surface variant="panel" className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-1.5">
          {/* `items-start` : sans cela le badge s'étire sur toute la largeur de
              la colonne et perd sa forme de pastille. */}
          <Badge tone="danger">Paiement non abouti</Badge>
          <h2 className="text-h3 font-bold">Aucun montant n’a été débité</h2>
          <p className="text-body-s text-text-2">
            {payment.failureReason ??
              'La demande n’a pas été validée. Cela arrive souvent quand le code n’a pas été saisi à temps.'}
          </p>
        </div>

        {/* Le panier est conservé : c'est l'information qui retient l'acheteur. */}
        <Alert tone="info" title="Tes places sont toujours réservées">
          Ta commande {order.reference} reste valable jusqu’à l’heure indiquée plus haut. Tu peux
          réessayer avec le même numéro ou en changer.
        </Alert>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" size="primary" block onClick={onRetry}>
            Réessayer
          </Button>
          <Button asChild variant="secondary" size="primary" block>
            <Link href={`/e/${order.eventSlug}`} className="text-center">
              Retour à l’événement
            </Link>
          </Button>
        </div>
      </Surface>

      {/* Référence toujours visible en cas d'échec : c'est ce que le support
          demandera en premier. */}
      <p className="text-center text-micro text-text-3">
        Référence à communiquer au support :{' '}
        <span className="tabular font-semibold">{order.reference}</span>
      </p>
    </div>
  );
}
