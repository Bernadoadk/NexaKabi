'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { PayoutAccount } from '@nexakabi/contracts';
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Surface,
  SurfaceHeader,
  SurfaceTitle,
} from '@nexakabi/ui';
import { addPayoutAccountAction } from '../actions';

const MOBILE_PROVIDERS = ['MTN', 'MOOV', 'CELTIIS'] as const;

/**
 * Comptes de retrait — liste et ajout.
 *
 * C'est le formulaire vers lequel `finances/page.tsx` renvoie déjà quand il
 * n'existe aucun compte : « Renseigne un numéro Mobile Money ou un compte
 * bancaire dans les paramètres de ton organisation ». Le champ le plus
 * important est `accountHolderName` — c'est lui que la vérification
 * d'identité rapprochera du nom sur la pièce déposée.
 */
export function PayoutAccountsSection({
  organizationId,
  accounts,
}: {
  organizationId: string;
  accounts: PayoutAccount[];
}) {
  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <SurfaceHeader>
        <SurfaceTitle>Comptes de retrait</SurfaceTitle>
      </SurfaceHeader>

      {accounts.length > 0 ? (
        <ul>
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-body font-semibold">
                  {account.provider ?? account.bankName ?? 'Compte'} · ••••{' '}
                  {account.maskedAccountNumber}
                </div>
                <div className="text-micro text-text-3">{account.accountHolderName}</div>
              </div>
              {account.isDefault ? <Badge tone="ink">Par défaut</Badge> : null}
              {account.lastFailureReason ? (
                <Badge tone="danger">Dernier échec : {account.lastFailureReason}</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-body-s text-text-2">
          Aucun compte enregistré. Ajoute un numéro Mobile Money ou un compte bancaire pour pouvoir
          demander un retrait.
        </p>
      )}

      <div className="border-t border-border-subtle px-5 py-4">
        <AddPayoutAccountForm organizationId={organizationId} hasAccounts={accounts.length > 0} />
      </div>
    </Surface>
  );
}

function AddPayoutAccountForm({
  organizationId,
  hasAccounts,
}: {
  organizationId: string;
  hasAccounts: boolean;
}) {
  const router = useRouter();
  const [type, setType] = React.useState<'MOBILE_MONEY' | 'BANK'>('MOBILE_MONEY');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <form
      className="flex flex-col gap-3.5"
      action={async (formData) => {
        setPending(true);
        setError(null);

        const result = await addPayoutAccountAction(organizationId, formData);
        setPending(false);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        router.refresh();
      }}
    >
      <h3 className="text-body font-bold">Ajouter un compte</h3>

      {error ? (
        <Alert tone="danger" title="Ajout impossible">
          {error}
        </Alert>
      ) : null}

      <Field label="Type de compte" htmlFor="type">
        <select
          id="type"
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value as 'MOBILE_MONEY' | 'BANK')}
          className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-body"
        >
          <option value="MOBILE_MONEY">Mobile Money</option>
          <option value="BANK">Compte bancaire</option>
        </select>
      </Field>

      {type === 'MOBILE_MONEY' ? (
        <Field label="Opérateur" htmlFor="provider">
          <select
            id="provider"
            name="provider"
            defaultValue="MTN"
            className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-body"
          >
            {MOBILE_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Banque" htmlFor="bankName">
          <Input id="bankName" name="bankName" required placeholder="Ecobank, UBA…" />
        </Field>
      )}

      <Field
        label="Numéro de compte"
        help={type === 'MOBILE_MONEY' ? 'Le numéro qui reçoit les fonds.' : "L'IBAN ou le RIB."}
        htmlFor="accountNumber"
      >
        <Input id="accountNumber" name="accountNumber" required minLength={4} />
      </Field>

      <Field
        label="Titulaire du compte"
        help="Doit correspondre au nom sur la pièce d’identité déposée à la vérification."
        htmlFor="accountHolderName"
      >
        <Input id="accountHolderName" name="accountHolderName" required minLength={2} />
      </Field>

      {hasAccounts ? (
        <label className="flex items-center gap-2 text-body-s text-text-2">
          <input type="checkbox" name="isDefault" className="size-4" />
          Utiliser comme compte par défaut
        </label>
      ) : null}

      <Button
        type="submit"
        variant="secondary"
        size="mobile"
        loading={pending}
        loadingLabel="Ajout…"
        className="self-start"
      >
        Ajouter le compte
      </Button>
    </form>
  );
}
