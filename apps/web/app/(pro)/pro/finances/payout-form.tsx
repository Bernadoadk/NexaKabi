'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { computePayoutFee, type ApiError } from '@nexakabi/contracts';
import { formatAmount } from '@nexakabi/utils';
import { Alert, Button, Field, Money, MoneyInput, Surface } from '@nexakabi/ui';

interface PayoutAccount {
  id: string;
  type: string;
  provider: string | null;
  bankName: string | null;
  accountNumber: string;
  isDefault: boolean;
}

/**
 * Demande de retrait.
 *
 * ── La règle du prototype, appliquée à la lettre ────────────────────────────
 * « Montant net affiché avant validation. » Les frais sont calculés à la
 * frappe, avec la MÊME fonction que le serveur — importée depuis les contrats,
 * jamais réimplémentée. Deux calculs de frais finiraient par diverger, et
 * l'écart se verrait sur le relevé d'un organisateur, pas dans un test.
 */
export function PayoutRequestForm({
  accounts,
  availableAmount,
}: {
  accounts: PayoutAccount[];
  availableAmount: number;
}) {
  const router = useRouter();

  const [accountId, setAccountId] = React.useState(
    accounts.find((account) => account.isDefault)?.id ?? accounts[0]?.id ?? '',
  );
  const [amount, setAmount] = React.useState(availableAmount);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const feeAmount = amount > 0 ? computePayoutFee(amount) : 0;
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

        <Field label="Compte de destination">
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-body"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)} · •••• {account.accountNumber.slice(-4)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Montant" help={`Disponible : ${formatAmount(availableAmount)} FCFA`}>
          <MoneyInput value={amount} onValueChange={(value) => setAmount(value ?? 0)} />
        </Field>

        {/* Le net, avant validation. C'est la promesse du prototype. */}
        <dl className="flex flex-col gap-2 rounded-card bg-surface-2 px-4 py-3">
          <Row label="Montant demandé">
            <Money amount={amount} size="small" />
          </Row>
          <Row label="Frais de retrait">
            <Money amount={-feeAmount} size="small" showSign />
          </Row>
          <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle pt-2">
            <dt className="text-body font-bold">Tu recevras</dt>
            <dd>
              <Money amount={Math.max(0, netAmount)} size="default" />
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

function accountLabel(account: PayoutAccount): string {
  if (account.provider) return account.provider;
  if (account.bankName) return account.bankName;
  return account.type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Compte bancaire';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-s text-text-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
