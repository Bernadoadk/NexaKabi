'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  COMMISSION_SCOPES,
  COMMISSION_SCOPE_LABELS,
  KNOWN_COUNTRIES,
  computeFeeBreakdown,
  type CommissionScope,
} from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Button, Field, Input, Surface } from '@nexakabi/ui';
import type { PolicyRates } from './describe';

/** Le billet de l'exemple : un prix courant au Bénin. */
const EXAMPLE_PRICE = 5_000;

/**
 * Publier une nouvelle version de commission.
 *
 * ── Pourquoi l'exemple chiffré ──────────────────────────────────────────────
 * « 5 %, plancher 100 F, 100 % acheteur » ne dit pas ce que paie quelqu'un.
 * L'exemple le dit, recalculé à chaque frappe par la MÊME fonction que le
 * tunnel d'achat : ce qui s'affiche ici est exactement ce que la vente
 * produira.
 */
export function NewPolicyForm({
  base,
  organizations,
}: {
  /** Valeurs de départ : la politique de la plateforme en vigueur. */
  base: PolicyRates;
  organizations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState<CommissionScope>('PLATFORM');
  const [rates, setRates] = React.useState(() => toForm(base));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) {
    return (
      <div>
        <Button type="button" variant="secondary" size="compact" onClick={() => setOpen(true)}>
          Publier une nouvelle version
        </Button>
      </div>
    );
  }

  const parsed = fromForm(rates);
  const example = parsed
    ? computeFeeBreakdown({
        lines: [{ unitPrice: EXAMPLE_PRICE, quantity: 1 }],
        policy: {
          ...parsed,
          minFeePerOrder: parsed.minFeePerOrder ?? undefined,
          maxFeePerOrder: parsed.maxFeePerOrder ?? undefined,
        },
      })
    : null;

  const set = (key: keyof FormRates) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setRates((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Surface variant="panel" padding="comfortable">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!parsed) return;

          const form = new FormData(event.currentTarget);
          setPending(true);
          setError(null);

          try {
            const response = await fetch('/api/admin/finance/commissions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: String(form.get('name') ?? '').trim(),
                scope,
                ...(scope === 'COUNTRY'
                  ? { countryCode: String(form.get('countryCode') ?? '') }
                  : {}),
                ...(scope === 'ORGANIZATION'
                  ? { organizationId: String(form.get('organizationId') ?? '') }
                  : {}),
                ...parsed,
              }),
            });
            const payload = (await response.json()) as { message?: string };

            if (!response.ok) {
              setError(payload.message ?? 'La politique n’a pas pu être publiée.');
              return;
            }

            setOpen(false);
            router.refresh();
          } catch {
            setError('L’API n’est pas joignable.');
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-body font-bold">Nouvelle version</h2>
          <Button type="button" variant="tertiary" size="compact" onClick={() => setOpen(false)}>
            Fermer
          </Button>
        </div>

        <Alert tone="info">
          Elle prend effet tout de suite et ferme la version en vigueur de même portée. Les ventes
          déjà faites gardent leur politique.
        </Alert>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Field
          label="Nom"
          help="Ce qui la distingue : « Bénin 2027 », « Remise Kolabi »."
          htmlFor="policy-name"
        >
          <Input id="policy-name" name="name" required minLength={3} maxLength={80} />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-s font-semibold">S’applique à</legend>
          <div className="flex flex-wrap gap-4">
            {COMMISSION_SCOPES.map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-body-s">
                <input
                  type="radio"
                  name="scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                />
                {COMMISSION_SCOPE_LABELS[value]}
              </label>
            ))}
          </div>

          {scope === 'COUNTRY' ? (
            <select
              name="countryCode"
              required
              className="h-9 max-w-xs rounded-field border border-border-field bg-surface px-2.5 text-body-s"
            >
              {KNOWN_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} {country.name}
                </option>
              ))}
            </select>
          ) : null}

          {scope === 'ORGANIZATION' ? (
            <select
              name="organizationId"
              required
              className="h-9 max-w-xs rounded-field border border-border-field bg-surface px-2.5 text-body-s"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          ) : null}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Commission (%)"
            value={rates.percent}
            onChange={set('percent')}
            step="0.1"
          />
          <NumberField label="Fixe par billet (F)" value={rates.fixed} onChange={set('fixed')} />
          <NumberField
            label="Part payée par l’acheteur (%)"
            value={rates.buyerShare}
            onChange={set('buyerShare')}
          />
          <NumberField
            label="Plancher par commande (F)"
            value={rates.min}
            onChange={set('min')}
            optional
          />
          <NumberField
            label="Plafond par commande (F)"
            value={rates.max}
            onChange={set('max')}
            optional
          />
          <label className="flex items-center gap-2 self-end pb-2 text-body-s">
            <input
              type="checkbox"
              checked={rates.free}
              onChange={(event) =>
                setRates((current) => ({ ...current, free: event.target.checked }))
              }
            />
            Prélever aussi sur les billets gratuits
          </label>
          <NumberField
            label="Frais de retrait (%)"
            value={rates.payoutPercent}
            onChange={set('payoutPercent')}
            step="0.1"
          />
          <NumberField
            label="Plafond des frais de retrait (F)"
            value={rates.payoutMax}
            onChange={set('payoutMax')}
          />
          <NumberField
            label="Retrait minimum (F)"
            value={rates.minPayout}
            onChange={set('minPayout')}
          />
        </div>

        {example ? (
          <p className="rounded-card bg-surface-alt px-4 py-3 text-body-s text-text-2">
            Pour un billet à{' '}
            <strong className="text-text-strong">{formatMoney(EXAMPLE_PRICE)}</strong> : l’acheteur
            paie <strong className="text-text-strong">{formatMoney(example.totalAmount)}</strong>,
            Nexa-Kabi garde{' '}
            <strong className="text-text-strong">{formatMoney(example.platformFeeAmount)}</strong>,
            l’organisateur reçoit{' '}
            <strong className="text-text-strong">{formatMoney(example.organizerNetAmount)}</strong>{' '}
            avant les frais de l’opérateur de paiement.
          </p>
        ) : (
          <Alert tone="warning">Un des montants n’est pas valide.</Alert>
        )}

        <div>
          <Button
            type="submit"
            variant="ink"
            size="compact"
            loading={pending}
            loadingLabel="Publication…"
            disabled={!parsed}
          >
            Publier cette version
          </Button>
        </div>
      </form>
    </Surface>
  );
}

interface FormRates {
  percent: string;
  fixed: string;
  min: string;
  max: string;
  buyerShare: string;
  free: boolean;
  payoutPercent: string;
  payoutMax: string;
  minPayout: string;
}

function toForm(policy: PolicyRates): FormRates {
  return {
    percent: String(policy.percentageBps / 100),
    fixed: String(policy.fixedAmountPerTicket),
    min: policy.minFeePerOrder === null ? '' : String(policy.minFeePerOrder),
    max: policy.maxFeePerOrder === null ? '' : String(policy.maxFeePerOrder),
    buyerShare: String(policy.buyerSharePercent),
    free: policy.appliesToFreeTickets,
    payoutPercent: String(policy.payoutFeeBps / 100),
    payoutMax: String(policy.payoutFeeMax),
    minPayout: String(policy.minPayoutAmount),
  };
}

/** `null` si un champ n'est pas un nombre admissible : le bouton reste fermé. */
function fromForm(form: FormRates): PolicyRates | null {
  const integer = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN);
  const percent = (value: string) => {
    const number = Number(value.trim().replace(',', '.'));
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : NaN;
  };
  const optional = (value: string) => (value.trim() === '' ? null : integer(value));

  const rates: PolicyRates = {
    percentageBps: percent(form.percent),
    fixedAmountPerTicket: integer(form.fixed),
    minFeePerOrder: optional(form.min),
    maxFeePerOrder: optional(form.max),
    buyerSharePercent: integer(form.buyerShare),
    appliesToFreeTickets: form.free,
    payoutFeeBps: percent(form.payoutPercent),
    payoutFeeMax: integer(form.payoutMax),
    minPayoutAmount: integer(form.minPayout),
  };

  const numbers = Object.values(rates).filter(
    (value): value is number => typeof value === 'number',
  );

  if (numbers.some((value) => Number.isNaN(value))) return null;
  if (rates.buyerSharePercent > 100 || rates.percentageBps > 3_000 || rates.payoutFeeBps > 1_000) {
    return null;
  }
  if (
    rates.minFeePerOrder !== null &&
    rates.maxFeePerOrder !== null &&
    rates.maxFeePerOrder < rates.minFeePerOrder
  ) {
    return null;
  }

  return rates;
}

function NumberField({
  label,
  value,
  onChange,
  step = '1',
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  step?: string;
  optional?: boolean;
}) {
  const id = React.useId();

  return (
    <Field label={label} hint={optional ? '· facultatif' : undefined} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={value}
        onChange={onChange}
        required={!optional}
      />
    </Field>
  );
}
