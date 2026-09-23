'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { PayoutAccount, PayoutMethod, PayoutMethods } from '@nexakabi/contracts';
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  PhoneInput,
  Select,
  Surface,
  SurfaceHeader,
  SurfaceTitle,
} from '@nexakabi/ui';
import { addPayoutAccountAction } from '../actions';

/**
 * Comptes de réception — liste et ajout.
 *
 * C'est le formulaire vers lequel `finances/page.tsx` renvoie déjà quand il
 * n'existe aucun compte. Le champ le plus important est `accountHolderName` —
 * c'est lui que la vérification d'identité rapprochera du nom sur la pièce
 * déposée.
 *
 * ── Les moyens viennent du pays, pas d'une liste figée ─────────────────────
 * L'organisateur choisit parmi les moyens que SON pays autorise en
 * versement : MTN et Moov au Bénin, Wave et Orange Money au Sénégal. Un
 * moyen fermé depuis reste visible sur le compte existant, marqué
 * indisponible, plutôt que de disparaître sans explication.
 *
 * Le moyen de réception est indépendant de ce que les participants ont
 * utilisé pour payer : recevoir sur MTN ce qui a été réglé par carte est le
 * cas normal, pas l'exception.
 */
export function PayoutAccountsSection({
  organizationId,
  accounts,
  payoutMethods,
}: {
  organizationId: string;
  accounts: PayoutAccount[];
  payoutMethods: PayoutMethods;
}) {
  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <SurfaceHeader>
        <SurfaceTitle>Comptes de réception</SurfaceTitle>
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
                  {account.methodLabel} · {account.maskedAccountNumber}
                </div>
                <div className="text-micro text-text-3">
                  {account.accountHolderName} · {account.countryCode} · {account.currency}
                </div>
              </div>
              {account.isDefault ? <Badge tone="ink">Par défaut</Badge> : null}
              {!account.payoutAvailable ? <Badge tone="warning">Moyen indisponible</Badge> : null}
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
        {payoutMethods.methods.length > 0 ? (
          <AddPayoutAccountForm
            organizationId={organizationId}
            hasAccounts={accounts.length > 0}
            payoutMethods={payoutMethods}
          />
        ) : (
          <Alert tone="warning" title="Aucun moyen de réception disponible">
            Aucun moyen de versement n’est encore ouvert pour ton pays. Les retraits seront
            possibles dès qu’un moyen sera activé.
          </Alert>
        )}
      </div>
    </Surface>
  );
}

function AddPayoutAccountForm({
  organizationId,
  hasAccounts,
  payoutMethods,
}: {
  organizationId: string;
  hasAccounts: boolean;
  payoutMethods: PayoutMethods;
}) {
  const router = useRouter();
  const [methodCode, setMethodCode] = React.useState<string>(payoutMethods.methods[0]?.code ?? '');
  const [accountNumber, setAccountNumber] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const method: PayoutMethod | undefined = payoutMethods.methods.find(
    (entry) => entry.code === methodCode,
  );
  const isBank = method?.kind === 'BANK_TRANSFER';

  return (
    <form
      className="flex flex-col gap-3.5"
      action={async (formData) => {
        setPending(true);
        setError(null);

        // Le type de compte découle du moyen : un virement va sur un compte
        // bancaire, tout le reste sur un numéro Mobile Money.
        formData.set('type', isBank ? 'BANK' : 'MOBILE_MONEY');
        formData.set('methodCode', methodCode);
        formData.set('accountNumber', accountNumber);

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

      <Field
        label="Moyen de réception"
        help={`Les moyens ouverts pour ${payoutMethods.countryCode} · versements en ${payoutMethods.currency}.`}
        htmlFor="methodCode"
      >
        <Select
          id="methodCode"
          value={methodCode}
          onValueChange={(value) => {
            setMethodCode(value);
            setAccountNumber('');
          }}
          options={payoutMethods.methods.map((entry) => ({
            value: entry.code,
            label: entry.label,
            description: entry.automatic
              ? 'Versement automatique par le prestataire'
              : 'Versement manuel, enregistré par Nexa-Kabi',
          }))}
        />
      </Field>

      {isBank ? (
        <>
          <Field label="Banque" htmlFor="bankName">
            <Input id="bankName" name="bankName" required placeholder="Ecobank, UBA…" />
          </Field>
          <Field label="Numéro de compte" help="L’IBAN ou le RIB." htmlFor="accountNumber">
            <Input
              id="accountNumber"
              required
              minLength={4}
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
            />
          </Field>
        </>
      ) : (
        <Field label="Numéro qui reçoit les fonds" htmlFor="accountNumber">
          <PhoneInput
            key={payoutMethods.countryCode}
            id="accountNumber"
            countryCode={payoutMethods.countryCode}
            required
            onValueChange={(e164, raw) => setAccountNumber(e164 ?? raw)}
          />
        </Field>
      )}

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
        disabled={!method}
      >
        Ajouter le compte
      </Button>
    </form>
  );
}
