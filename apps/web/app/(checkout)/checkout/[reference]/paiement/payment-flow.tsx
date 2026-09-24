'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import {
  isPaymentPending,
  type ApiError,
  type CheckoutPaymentMethod,
  type CheckoutPaymentMethods,
  type Order,
  type PaymentMethodCode,
  type PaymentState,
} from '@nexakabi/contracts';
import { formatShortCountdown } from '@nexakabi/utils';
import {
  Alert,
  Badge,
  Button,
  Field,
  Money,
  PaymentMethodLogo,
  PhoneInput,
  ProgressRing,
  Surface,
  cn,
  startRouteProgress,
} from '@nexakabi/ui';
import { openPaymentWidget } from '@/lib/payment-widget';

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
 * téléphone, la connexion peut tomber, l'onglet peut se fermer. Seul le
 * prestataire tranche. Le compte à rebours n'annonce donc pas un échec — il
 * annonce le moment où la demande sera abandonnée, ce qui n'est pas la même
 * chose et ne se dit pas de la même façon.
 *
 * ── Ce que l'écran ne sait pas ─────────────────────────────────────────────
 * Quel prestataire traite le paiement. Il reçoit les MOYENS ouverts dans le
 * pays de la commande — « MTN MoMo », « Carte bancaire » — et, pour chacun,
 * COMMENT il se valide : numéro saisi ici (`push`), page du prestataire
 * (`redirect`), ou fenêtre du prestataire ouverte par-dessus (`widget`). Un
 * pays de plus n'ajoute pas une ligne ici.
 *
 * ── Ce que l'écran ne décide jamais ────────────────────────────────────────
 * Qu'un paiement a réussi. Même quand la fenêtre du prestataire l'annonce, la
 * page ne fait que transmettre la référence de la transaction au serveur, qui
 * la vérifie chez le prestataire. Les billets n'existent qu'après.
 */

/** Cadence d'interrogation. Assez rapide pour paraître instantané, assez lente
 *  pour ne pas marteler l'API pendant les trois minutes d'attente. */
const POLL_INTERVAL_MS = 3_000;

export function PaymentFlow({
  order,
  methods,
  initialPayment,
  returnedFromProvider = false,
}: {
  order: Order;
  methods: CheckoutPaymentMethods;
  initialPayment: PaymentState | null;
  /** Vrai quand l'acheteur revient d'une page de paiement hébergée. */
  returnedFromProvider?: boolean;
}) {
  const router = useRouter();

  const [payment, setPayment] = React.useState<PaymentState | null>(initialPayment);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  /** La fenêtre du prestataire se charge. */
  const [opening, setOpening] = React.useState(false);
  /** Le serveur vérifie une transaction annoncée par la fenêtre. */
  const [verifying, setVerifying] = React.useState(false);

  const [method, setMethod] = React.useState<PaymentMethodCode | null>(
    initialPayment?.method ?? methods.methods[0]?.code ?? null,
  );
  // Le numéro à débiter appartient au pays de la commande. Celui de
  // l'acheteur n'est proposé que s'il en relève : un acheteur béninois d'un
  // événement à Dakar ne paie pas par Wave avec un +229.
  const [payerPhone, setPayerPhone] = React.useState(
    order.buyerPhone.startsWith(`+${methods.dialCode}`) ? order.buyerPhone : '',
  );

  const selected = methods.methods.find((entry) => entry.code === method) ?? null;
  const waiting = payment !== null && isPaymentPending(payment.status);

  const goToConfirmation = React.useCallback(() => {
    startRouteProgress();
    router.push(`/commandes/${order.reference}/confirmation`);
  }, [order.reference, router]);

  // Interrogation de l'état pendant l'attente. C'est le serveur qui interroge
  // le prestataire : la page ne fait que demander le verdict connu.
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

        // Une réponse identique ne remplace pas l'état : l'intervalle n'est
        // réarmé que lorsque quelque chose change vraiment.
        if (
          next.status === payment.status &&
          next.failureReason === payment.failureReason &&
          next.method === payment.method
        ) {
          return;
        }

        setPayment(next);

        if (next.status === 'SUCCEEDED') {
          window.clearInterval(timer);
          // L'acheteur n'a rien cliqué : c'est le prestataire qui vient de
          // répondre. Sans le filet, l'écran d'attente resterait identique à
          // lui-même pendant que la confirmation se charge — juste au moment
          // où l'argent vient de partir.
          goToConfirmation();
        }
      })();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [payment, order.reference, goToConfirmation]);

  /**
   * Transmet au serveur la transaction annoncée par la fenêtre du prestataire.
   *
   * Le serveur la lit chez le prestataire, vérifie qu'elle appartient à CE
   * paiement et porte le bon montant, et répond par l'état qui en découle —
   * c'est le seul verdict que la page affiche.
   */
  const confirmTransaction = React.useCallback(
    async (paymentId: string, providerReference: string, announced: 'success' | 'other') => {
      if (announced === 'success') setVerifying(true);

      try {
        const response = await fetch(
          `/api/checkout/orders/${order.reference}/payments/${paymentId}/confirm`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerReference }),
          },
        );

        const body: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          // Refus de vérification, prestataire injoignable : l'écran reste en
          // attente — la notification du prestataire peut encore conclure.
          setError(
            (body as ApiError | null)?.message ??
              'La vérification du paiement n’a pas abouti. La confirmation peut encore arriver.',
          );
          return;
        }

        const next = body as PaymentState;

        if (next.status === 'SUCCEEDED') {
          goToConfirmation();
          return;
        }

        setError(null);
        setPayment(next);
      } finally {
        if (announced === 'success') setVerifying(false);
      }
    },
    [order.reference, goToConfirmation],
  );

  /** Ouvre la fenêtre du prestataire pour un paiement qui l'attend. */
  const launchWidget = React.useCallback(
    async (state: PaymentState) => {
      if (!state.widget) return;

      setOpening(true);
      setError(null);

      // L'adresse garde le paiement : un rafraîchissement reprend cet écran
      // au lieu de repartir de zéro.
      const url = new URL(window.location.href);
      url.searchParams.set('paiement', state.paymentId);
      url.searchParams.delete('retour');
      window.history.replaceState(window.history.state, '', url);

      try {
        await openPaymentWidget(state.widget, {
          onSuccess: (reference) => void confirmTransaction(state.paymentId, reference, 'success'),
          onFailed: (reference) => {
            if (reference) void confirmTransaction(state.paymentId, reference, 'other');
          },
          onPending: (reference) => void confirmTransaction(state.paymentId, reference, 'other'),
          onClose: () => setOpening(false),
        });
      } catch {
        setError(
          'La fenêtre de paiement n’a pas pu s’ouvrir. Vérifie ta connexion, puis réessaie.',
        );
      } finally {
        setOpening(false);
      }
    },
    [confirmTransaction],
  );

  async function initiate() {
    if (!selected) return;

    setPending(true);
    setError(null);

    const response = await fetch(`/api/checkout/orders/${order.reference}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: selected.code,
        payerPhone: selected.requiresPhone ? payerPhone : undefined,
      }),
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      setPending(false);
      setError((body as ApiError | null)?.message ?? 'Impossible de lancer le paiement.');
      return;
    }

    const state = body as PaymentState;

    if (state.status === 'SUCCEEDED') {
      goToConfirmation();
      return;
    }

    // Fenêtre du prestataire : elle s'ouvre par-dessus cet écran, qui passe
    // en attente derrière elle.
    if (state.widget && isPaymentPending(state.status)) {
      setPending(false);
      setPayment(state);
      void launchWidget(state);
      return;
    }

    // Page du prestataire : on y va, sans rien conclure. Le retour ramène ici
    // avec l'identifiant du paiement, et l'interrogation dit ce qu'il en est.
    if (state.redirectUrl && isPaymentPending(state.status)) {
      startRouteProgress();
      window.location.assign(state.redirectUrl);
      return;
    }

    setPending(false);
    setPayment(state);
  }

  function backToChoice() {
    // On n'« annule » pas la demande en cours : elle peut encore aboutir.
    // Revenir au choix relancera simplement une demande, et le serveur
    // reprendra ou abandonnera la précédente à ce moment-là.
    setPayment(null);
    setError(null);

    // L'adresse porte encore l'identifiant du paiement : un rafraîchissement
    // le rechargerait. On revient à l'adresse nue.
    const url = new URL(window.location.href);
    if (url.searchParams.has('paiement') || url.searchParams.has('retour')) {
      url.searchParams.delete('paiement');
      url.searchParams.delete('retour');
      window.history.replaceState(window.history.state, '', url);
    }
  }

  if (waiting && payment?.widget) {
    return (
      <WidgetState
        payment={payment}
        method={selected}
        error={error}
        opening={opening}
        verifying={verifying}
        onOpen={() => void launchWidget(payment)}
        onChangeMethod={backToChoice}
      />
    );
  }

  if (waiting && payment) {
    return (
      <WaitingState
        payment={payment}
        method={selected}
        returnedFromProvider={returnedFromProvider}
        onChangeMethod={backToChoice}
      />
    );
  }

  if (payment && payment.status !== 'SUCCEEDED') {
    return <FailedState order={order} payment={payment} onRetry={backToChoice} />;
  }

  return (
    <ChooseState
      order={order}
      methods={methods}
      selected={selected}
      onMethodChange={setMethod}
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
  selected,
  onMethodChange,
  payerPhone,
  onPayerPhoneChange,
  error,
  pending,
  onSubmit,
}: {
  order: Order;
  methods: CheckoutPaymentMethods;
  selected: CheckoutPaymentMethod | null;
  onMethodChange: (method: PaymentMethodCode) => void;
  payerPhone: string;
  onPayerPhoneChange: (phone: string) => void;
  error: string | null;
  pending: boolean;
  onSubmit: () => void;
}) {
  const mobileMoney = methods.methods.filter((method) => method.group === 'mobile_money');
  const others = methods.methods.filter((method) => method.group !== 'mobile_money');
  const hasAvailable = methods.methods.length > 0;
  const asksPhone = selected !== null && selected.requiresPhone;

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
        {mobileMoney.length > 0 ? (
          <>
            <div className="flex items-baseline justify-between border-b border-border-subtle px-5 py-4">
              <h2 className="text-body font-bold">Mobile Money</h2>
              <span className="text-micro text-text-3">Recommandé</span>
            </div>

            <MethodList
              methods={mobileMoney}
              selected={selected?.code ?? null}
              onSelect={onMethodChange}
              recommendedFirst
            />
          </>
        ) : null}

        {others.length > 0 ? (
          <>
            <div
              className={cn(
                'border-b border-border-subtle bg-surface-alt px-5 py-2.5',
                mobileMoney.length > 0 && 'border-t',
              )}
            >
              <h2 className="text-body-s font-bold text-text-2">
                {mobileMoney.length > 0 ? 'Autres moyens' : 'Moyens de paiement'}
              </h2>
            </div>
            <MethodList
              methods={others}
              selected={selected?.code ?? null}
              onSelect={onMethodChange}
            />
          </>
        ) : null}
      </Surface>

      {asksPhone ? (
        <Field
          label="Numéro à débiter"
          help="Souvent le tien, mais pas forcément : quelqu’un peut payer pour toi."
        >
          <PhoneInput
            key={methods.countryCode}
            countryCode={methods.countryCode}
            defaultValue={payerPhone}
            onValueChange={(e164, raw) => onPayerPhoneChange(e164 ?? raw)}
          />
        </Field>
      ) : null}

      {selected?.flow === 'widget' ? (
        <Alert tone="info" title="Paiement dans une fenêtre sécurisée">
          {selected.kind === 'CARD'
            ? 'La fenêtre de paiement s’ouvre sur cette page : tu y saisis ta carte, puis tu reviens ici automatiquement.'
            : 'La fenêtre de paiement s’ouvre sur cette page : tu y saisis ton numéro, puis tu valides sur ton téléphone.'}{' '}
          Des frais de l’opérateur peuvent s’ajouter au montant : ils s’affichent dans la fenêtre,
          avant que tu valides.
        </Alert>
      ) : null}

      {selected?.redirects ? (
        <Alert tone="info" title="Paiement sur une page sécurisée">
          Tu vas être dirigé vers la page de paiement, puis ramené ici une fois le paiement validé.
          Ta réservation reste valable pendant ce temps.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          variant="primary"
          size="primary"
          block
          loading={pending}
          disabled={!selected || !hasAvailable}
        >
          {selected?.redirects ? 'Continuer vers le paiement' : 'Payer'}{' '}
          <Money
            amount={order.totalAmount}
            currency={order.currency}
            size="small"
            className="ml-1"
          />
        </Button>

        {/* Mention non négociable : c'est la protection la plus efficace contre
            l'ingénierie sociale sur ce marché. */}
        {methods.notice ? (
          <p className="flex items-start gap-2 rounded-card bg-surface-alt px-4 py-3 text-micro text-text-2">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {methods.notice}
          </p>
        ) : null}
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
  methods: CheckoutPaymentMethod[];
  selected: PaymentMethodCode | null;
  onSelect: (method: PaymentMethodCode) => void;
  recommendedFirst?: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {methods.map((method, index) => {
        const active = method.code === selected;
        const delayed = method.availability === 'DELAYED';

        return (
          <li key={method.code}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 border-b border-border-subtle px-4 py-3 transition last:border-b-0',
                active ? 'bg-coral-50' : 'hover:bg-surface-alt',
              )}
            >
              {/* Le logo prend la place de la puce : c'est lui qu'on reconnaît
                  d'abord. Le bouton radio reste, invisible mais présent, pour
                  le clavier et les lecteurs d'écran. */}
              <input
                type="radio"
                name="payment-method"
                value={method.code}
                checked={active}
                onChange={() => onSelect(method.code)}
                className="peer sr-only"
              />

              <PaymentMethodLogo
                logo={method.logo}
                label={method.label}
                brandColor={method.brandColor}
                brandColorIsLight={method.brandColorIsLight}
                className={cn(
                  'transition',
                  // L'anneau de focus doit se voir sur le logo, puisque le
                  // bouton radio ne se voit plus.
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-coral peer-focus-visible:ring-offset-2',
                )}
              />

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-body font-semibold">{method.label}</span>
                  {recommendedFirst && index === 0 ? <Badge tone="accent">Recommandé</Badge> : null}
                  {/* Un statut n'est jamais porté par la couleur seule :
                      toujours un mot. Règle du design system. */}
                  {delayed ? <Badge tone="warning">Retards en cours</Badge> : null}
                  {method.redirects ? (
                    <ExternalLink aria-hidden className="size-3.5 text-text-3" />
                  ) : null}
                </span>
                <span className="text-micro text-text-3">
                  {delayed
                    ? 'L’opérateur répond plus lentement que d’habitude.'
                    : method.description}
                </span>
              </span>

              {/* Coche de sélection : sans le bouton radio, il faut un repère
                  qui ne dépende pas du seul fond coloré. */}
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border transition',
                  active ? 'border-coral bg-coral text-white' : 'border-border-strong',
                )}
              >
                {active ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A4 · Attente — fenêtre de paiement du prestataire
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derrière la fenêtre du prestataire, et après elle.
 *
 * Trois moments : la fenêtre est ouverte (ou vient d'être fermée), une
 * transaction annoncée réussie est en cours de vérification, ou la dernière
 * tentative a échoué. Dans les trois, le paiement reste ouvert — réessayer
 * se fait sur LE MÊME paiement, jamais sur un second.
 */
function WidgetState({
  payment,
  method,
  error,
  opening,
  verifying,
  onOpen,
  onChangeMethod,
}: {
  payment: PaymentState;
  method: CheckoutPaymentMethod | null;
  error: string | null;
  opening: boolean;
  verifying: boolean;
  onOpen: () => void;
  onChangeMethod: () => void;
}) {
  const failed = payment.failureReason !== null && !verifying;

  return (
    <div className="flex flex-col gap-5">
      <Surface variant="panel" className="flex flex-col items-center gap-4 py-8 text-center">
        {failed ? (
          <Badge tone="danger">Paiement non abouti</Badge>
        ) : (
          <span className="relative flex items-center justify-center">
            <ProgressRing
              size={72}
              thickness={4}
              label={verifying ? 'Vérification du paiement' : 'Paiement en attente'}
            />
            {method ? (
              <span className="absolute">
                <PaymentMethodLogo
                  logo={method.logo}
                  label={method.label}
                  brandColor={method.brandColor}
                  brandColorIsLight={method.brandColorIsLight}
                  size="compact"
                />
              </span>
            ) : null}
          </span>
        )}

        <div className="flex flex-col gap-1">
          <h2 className="text-h3 font-bold">
            {verifying
              ? 'Vérification du paiement…'
              : failed
                ? 'Le paiement n’a pas abouti'
                : 'Termine ton paiement dans la fenêtre sécurisée'}
          </h2>
          <p className="text-body-s text-text-2">
            {verifying ? (
              'Nous confirmons ton paiement auprès de l’opérateur. Ne ferme pas cette page.'
            ) : failed ? (
              <>
                {payment.failureReason} Tes places restent réservées : tu peux réessayer ou changer
                de moyen.
              </>
            ) : (
              <>
                Paiement de{' '}
                <Money amount={payment.amount} currency={payment.currency} size="small" /> par{' '}
                <span className="font-semibold">{method?.label ?? payment.methodLabel}</span>. Une
                fois validé, la confirmation arrive ici toute seule.
              </>
            )}
          </p>
        </div>

        {/* La phrase qui évite le double paiement : un acheteur inquiet qui
            ne voit rien venir recommence — ici, il sait qu'il ne doit pas. */}
        <p className="flex max-w-[44ch] items-start gap-2 text-left text-micro text-text-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Si tu as déjà validé le paiement, n’en refais pas un autre : la confirmation arrive ici,
          et tes billets t’attendront dans « Mes commandes ».
        </p>
      </Surface>

      {error ? (
        <Alert tone="warning" title="Vérification en attente">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="primary"
          size="primary"
          block
          loading={opening}
          disabled={verifying}
          onClick={onOpen}
        >
          {failed ? 'Réessayer' : 'Ouvrir la fenêtre de paiement'}
        </Button>
        <Button
          variant="secondary"
          size="primary"
          block
          disabled={verifying}
          onClick={onChangeMethod}
        >
          Changer de moyen de paiement
        </Button>
      </div>

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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A4 · Attente — téléphone ou page du prestataire
// ─────────────────────────────────────────────────────────────────────────────

function WaitingState({
  payment,
  method,
  returnedFromProvider,
  onChangeMethod,
}: {
  payment: PaymentState;
  method: CheckoutPaymentMethod | null;
  returnedFromProvider: boolean;
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
  // Un paiement sur page hébergée n'a pas de téléphone à valider : l'attente
  // dit autre chose, et propose de rouvrir la page si elle a été fermée.
  const hosted = Boolean(payment.redirectUrl) && !payment.maskedPayerPhone;

  return (
    <div className="flex flex-col gap-5">
      <Surface variant="panel" className="flex flex-col items-center gap-4 py-8 text-center">
        {/* Sans `value` : l'anneau tourne au lieu d'afficher un pourcentage.
            Chiffrer une progression mentirait — personne ne sait quand
            l'acheteur composera son code sur son téléphone. */}
        {/* Le logo au centre de l'anneau : pendant l'attente, l'acheteur doit
            reconnaître d'un coup d'œil QUI lui demande de valider — c'est
            l'application qu'il va ouvrir sur son téléphone. */}
        <span className="relative flex items-center justify-center">
          <ProgressRing size={72} thickness={4} label="Paiement en cours de validation" />
          {method ? (
            <span className="absolute">
              <PaymentMethodLogo
                logo={method.logo}
                label={method.label}
                brandColor={method.brandColor}
                brandColorIsLight={method.brandColorIsLight}
                size="compact"
              />
            </span>
          ) : null}
        </span>

        <div className="flex flex-col gap-1">
          <h2 className="text-h3 font-bold">
            {hosted ? 'Confirmation du paiement en cours' : 'Valide le paiement sur ton téléphone'}
          </h2>
          <p className="text-body-s text-text-2">
            {hosted ? (
              <>
                Nous attendons la confirmation de{' '}
                <Money amount={payment.amount} currency={payment.currency} size="small" /> par{' '}
                <span className="font-semibold">{method?.label ?? payment.methodLabel}</span>.
              </>
            ) : (
              <>
                Une demande de{' '}
                <Money amount={payment.amount} currency={payment.currency} size="small" /> a été
                envoyée au <span className="font-semibold">{payment.maskedPayerPhone}</span>.
              </>
            )}
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

      {returnedFromProvider && hosted ? (
        <Alert tone="info" title="Tu es bien revenu">
          La confirmation arrive parfois quelques secondes après le retour. Rien à faire de ton
          côté.
        </Alert>
      ) : null}

      {payment.instructions ? (
        <Alert tone="info" title="Tu n’as rien reçu ?">
          {payment.instructions}
        </Alert>
      ) : null}

      {payment.confirmationUrl ? (
        <Button asChild variant="primary" size="primary" block>
          {/* À côté, jamais à la place : cette page reste là et apprend le
              verdict, que le prestataire renvoie l'acheteur ou non. */}
          <a
            href={payment.confirmationUrl}
            target="_blank"
            rel="noreferrer"
            className="text-center"
          >
            Ouvrir la page de validation
          </a>
        </Button>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {hosted && payment.redirectUrl ? (
          <Button asChild variant="secondary" size="primary" block>
            <a href={payment.redirectUrl} className="text-center">
              Rouvrir la page de paiement
            </a>
          </Button>
        ) : null}
        <Button
          variant={hosted ? 'tertiary' : 'secondary'}
          size="primary"
          block
          onClick={onChangeMethod}
        >
          {hosted ? 'Changer de moyen de paiement' : 'Changer de numéro ou d’opérateur'}
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
          réessayer avec le même moyen ou en changer.
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
