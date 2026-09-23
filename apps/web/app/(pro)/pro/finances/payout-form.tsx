'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { computePayoutFee, type ApiError, type PayoutAccount } from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Button, Field, Money, MoneyInput, Select, Surface } from '@nexakabi/ui';

/**
 * Demande de retrait.
 *
 * ── La règle du prototype, appliquée à la lettre ────────────────────────────
 * « Montant net affiché avant validation. » Les frais sont d'abord estimés à
 * la frappe avec la fonction des contrats — la même que le serveur —, puis
 * CONFIRMÉS par le devis de l'API : la politique de commission peut être
 * propre à l'organisation ou à son pays, et seul le serveur la connaît. Deux
 * calculs qui divergeraient se verraient sur le relevé d'un organisateur, pas
 * dans un test.
 *
 * ── Le compte de réception, pas le moyen de paiement des participants ──────
 * L'organisateur choisit OÙ recevoir. Que ses acheteurs aient payé par carte
 * ou par Wave ne change rien : la répartition a déjà eu lieu, l'argent est
 * dans son solde, et il part vers le compte qu'il désigne.
 */
export function PayoutRequestForm({
  accounts,
  availableAmount,
  currency,
}: {
  accounts: PayoutAccount[];
  availableAmount: number;
  currency: string;
}) {
  const router = useRouter();

  const usable = accounts.filter((account) => account.payoutAvailable);

  const [accountId, setAccountId] = React.useState(
    usable.find((account) => account.isDefault)?.id ?? usable[0]?.id ?? '',
  );
  const [amount, setAmount] = React.useState(availableAmount);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [quote, setQuote] = React.useState<{ amount: number; feeAmount: number } | null>(null);

  // Devis du serveur, à la frappe, avec un léger délai : c'est lui qui fait
  // foi, l'estimation locale ne sert qu'à ne pas laisser l'écran vide.
  React.useEffect(() => {
    if (amount <= 0) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch(`/api/pro/finance/payouts/quote?amount=${amount}`);
        if (cancelled || !response.ok) return;
        const body = (await response.json()) as { feeAmount: number };
        if (!cancelled) setQuote({ amount, feeAmount: body.feeAmount });
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amount]);

  const feeAmount =
    amount > 0 ? (quote?.amount === amount ? quote.feeAmount : computePayoutFee(amount)) : 0;
  const netAmount = amount - feeAmount;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch('/api/pro/finance/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payoutAccountId: accountId, amount }),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      setPending(false);
      setError((body as ApiError | null)?.message ?? 'La demande n’a pas pu être enregistrée.');
      return;
    }

    setPending(false);
    router.refresh();
  }

  return (
    <Surface variant="panel" padding="comfortable">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="text-h3 font-bold">Demander un retrait</h2>

        {error ? (
          <Alert tone="danger" title="Retrait impossible">
            {error}
          </Alert>
        ) : null}

        {usable.length === 0 ? (
          <Alert tone="warning" title="Aucun compte utilisable">
            Le moyen de réception de tes comptes n’est plus disponible. Enregistre un autre compte
            dans les paramètres de ton organisation.
          </Alert>
        ) : null}

        <Field label="Compte de réception" htmlFor="payout-account">
          <Select
            id="payout-account"
            value={accountId}
            onValueChange={setAccountId}
            options={usable.map((account) => ({
              value: account.id,
              label: account.methodLabel,
              description: `${account.maskedAccountNumber} · ${account.accountHolderName}`,
            }))}
          />
        </Field>

        <Field label="Montant" help={`Disponible : ${formatMoney(availableAmount, currency)}`}>
          <MoneyInput
            value={amount}
            currency={currency}
            onValueChange={(value) => setAmount(value ?? 0)}
          />
        </Field>

        {/* Le net, avant validation. C'est la promesse du prototype. */}
        <dl className="flex flex-col gap-2 rounded-card bg-surface-2 px-4 py-3">
          <Row label="Montant demandé">
            <Money amount={amount} currency={currency} size="small" />
          </Row>
          <Row label="Frais de retrait">
            <Money amount={-feeAmount} currency={currency} size="small" showSign />
          </Row>
          <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle pt-2">
            <dt className="text-body font-bold">Tu recevras</dt>
            <dd>
              <Money amount={Math.max(0, netAmount)} currency={currency} size="default" />
            </dd>
          </div>
        </dl>

        <Button
          type="submit"
          variant="ink"
          size="primary"
          block
          loading={pending}
          disabled={amount <= 0 || amount > availableAmount || !accountId}
        >
          Demander le retrait
        </Button>
      </form>
    </Surface>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-s text-text-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
