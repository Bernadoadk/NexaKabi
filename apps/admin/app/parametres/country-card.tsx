'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Minus, X } from 'lucide-react';
import type {
  CountryConfiguration,
  CountryPaymentMethod,
  PaymentProviderCode,
} from '@nexakabi/contracts';
import { Alert, Badge, Button, Field, Select, Surface, cn } from '@nexakabi/ui';

interface Catalogue {
  methods: { code: string; label: string; kind: string }[];
  providers: {
    code: PaymentProviderCode;
    label: string;
    connected: boolean;
    status: 'ACTIVE' | 'LEGACY';
    methodCodes: string[];
    /** Moyens traités pays par pays, quand ils diffèrent du catalogue général. */
    methodCodesByCountry?: Record<string, string[]>;
  }[];
}

/**
 * Un pays et ses moyens de paiement.
 *
 * Trois gestes, et rien d'autre : ouvrir ou fermer le pays, décider pour
 * chaque moyen s'il collecte et s'il verse, ajouter un moyen du catalogue en
 * lui désignant son prestataire. La colonne « prestataire » montre ce que la
 * dernière synchronisation a constaté ; la colonne « effectif » ce que le
 * public voit réellement, une fois décision, constat et branchement croisés.
 */
export function CountryCard({
  country,
  catalogue,
  canAct,
}: {
  country: CountryConfiguration;
  catalogue: Catalogue;
  canAct: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function call(path: string, method: 'PATCH' | 'PUT' | 'DELETE', body?: unknown) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/settings/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? 'La modification a échoué.');
        return;
      }

      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  function toggleMethod(method: CountryPaymentMethod, side: 'collectionEnabled' | 'payoutEnabled') {
    void call(`countries/${country.code}/methods`, 'PUT', {
      methodCode: method.methodCode,
      providerCode: method.providerCode,
      collectionEnabled:
        side === 'collectionEnabled' ? !method.collectionEnabled : method.collectionEnabled,
      payoutEnabled: side === 'payoutEnabled' ? !method.payoutEnabled : method.payoutEnabled,
      position: method.position,
    });
  }

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-4">
        <span aria-hidden className="text-[22px]">
          {country.flag}
        </span>
        <div className="min-w-[200px] flex-1">
          <h2 className="text-body font-bold">
            {country.name} <span className="font-medium text-text-3">· {country.code}</span>
          </h2>
          <p className="text-micro text-text-3">
            {country.currency} · +{country.dialCode} · {country.cityCount} ville(s) active(s)
          </p>
        </div>

        {country.isDefault ? <Badge tone="ink">Par défaut</Badge> : null}
        <Badge tone={country.isActive ? 'success' : 'neutral'}>
          {country.isActive ? 'Ouvert' : 'Fermé'}
        </Badge>

        {canAct ? (
          <div className="flex flex-wrap gap-2">
            {!country.isDefault ? (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                loading={pending}
                onClick={() =>
                  void call(`countries/${country.code}`, 'PATCH', { isActive: !country.isActive })
                }
              >
                {country.isActive ? 'Fermer' : 'Ouvrir'}
              </Button>
            ) : null}
            {country.isActive && !country.isDefault ? (
              <Button
                type="button"
                variant="tertiary"
                size="compact"
                loading={pending}
                onClick={() => void call(`countries/${country.code}`, 'PATCH', { isDefault: true })}
              >
                Définir par défaut
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="px-5 pt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {country.isActive && country.cityCount === 0 ? (
        <div className="px-5 pt-4">
          <Alert tone="warning" title="Aucune ville active">
            Un pays ouvert sans ville ne peut accueillir que des événements en ligne. Ajoute ses
            villes au référentiel.
          </Alert>
        </div>
      ) : null}

      {country.methods.length === 0 ? (
        <p className="px-5 py-4 text-body-s text-text-2">
          Aucun moyen de paiement configuré. Le pays ne peut ni encaisser ni verser.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-body-s">
            <thead>
              <tr className="border-b border-border-subtle text-left text-micro uppercase tracking-wide text-text-3">
                <th className="px-5 py-2.5 font-semibold">Moyen</th>
                <th className="px-3 py-2.5 font-semibold">Prestataire</th>
                <th className="px-3 py-2.5 text-center font-semibold">Collecte</th>
                <th className="px-3 py-2.5 text-center font-semibold">Versement</th>
                <th className="px-3 py-2.5 text-center font-semibold">Constat prestataire</th>
                <th className="px-3 py-2.5 text-center font-semibold">Effectif</th>
                {canAct ? <th className="px-3 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {country.methods.map((method) => (
                <tr key={method.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="font-semibold">{method.label}</div>
                    <div className="text-micro text-text-3">
                      {method.methodCode} · {method.kind}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{method.providerCode}</div>
                    <div className="text-micro text-text-3">{method.providerMethodCode}</div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Toggle
                      value={method.collectionEnabled}
                      disabled={!canAct || pending}
                      onChange={() => toggleMethod(method, 'collectionEnabled')}
                      label={`Collecte ${method.label}`}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Toggle
                      value={method.payoutEnabled}
                      disabled={!canAct || pending}
                      onChange={() => toggleMethod(method, 'payoutEnabled')}
                      label={`Versement ${method.label}`}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Observed value={method.providerCollectionEnabled} label="collecte" />
                      <Observed value={method.providerPayoutEnabled} label="versement" />
                    </div>
                    <div className="text-micro text-text-3">
                      {method.providerSyncedAt
                        ? `synchronisé le ${new Date(method.providerSyncedAt).toLocaleDateString('fr-FR')}`
                        : 'jamais synchronisé'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Badge tone={method.effectiveCollection ? 'success' : 'neutral'}>
                        {method.effectiveCollection ? 'Collecte' : 'Pas de collecte'}
                      </Badge>
                      <Badge tone={method.effectivePayout ? 'success' : 'neutral'}>
                        {method.effectivePayout ? 'Versement' : 'Pas de versement'}
                      </Badge>
                    </div>
                  </td>
                  {canAct ? (
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="tertiary"
                        size="compact"
                        loading={pending}
                        onClick={() => {
                          if (window.confirm(`Retirer ${method.label} de ${country.name} ?`)) {
                            void call(`countries/${country.code}/methods/${method.id}`, 'DELETE');
                          }
                        }}
                      >
                        Retirer
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canAct ? (
        <AddMethodForm
          country={country}
          catalogue={catalogue}
          pending={pending}
          onSubmit={(body) => void call(`countries/${country.code}/methods`, 'PUT', body)}
        />
      ) : null}
    </Surface>
  );
}

function Toggle({
  value,
  disabled,
  onChange,
  label,
}: {
  value: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition',
        value ? 'bg-ink' : 'bg-border-field',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow transition',
          value ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** Ce que le prestataire a dit : oui, non, ou rien encore. */
function Observed({ value, label }: { value: boolean | null; label: string }) {
  const Icon = value === null ? Minus : value ? Check : X;
  const tone = value === null ? 'text-text-3' : value ? 'text-mint-700' : 'text-red-700';

  return (
    <span className={cn('inline-flex items-center gap-1 text-micro', tone)} title={label}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

function AddMethodForm({
  country,
  catalogue,
  pending,
  onSubmit,
}: {
  country: CountryConfiguration;
  catalogue: Catalogue;
  pending: boolean;
  onSubmit: (body: {
    methodCode: string;
    providerCode: string;
    collectionEnabled: boolean;
    payoutEnabled: boolean;
    position: number;
  }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [methodCode, setMethodCode] = React.useState(catalogue.methods[0]?.code ?? '');
  const [providerCode, setProviderCode] = React.useState(catalogue.providers[0]?.code ?? '');

  // Un moyen ne se confie qu'à un prestataire qui le connaît DANS CE PAYS :
  // un prestataire ne propose pas toujours les mêmes opérateurs d'un pays à
  // l'autre. Proposer l'impossible ferait échouer l'ajout.
  const providers = catalogue.providers.filter(
    (provider) =>
      // Un prestataire hérité ne reçoit plus rien de neuf : il reste visible
      // sur les lignes existantes, jamais dans ce formulaire d'ajout.
      provider.status !== 'LEGACY' &&
      (provider.methodCodesByCountry?.[country.code] ?? provider.methodCodes).includes(methodCode),
  );
  const chosenProvider =
    providers.find((provider) => provider.code === providerCode) ?? providers[0];

  if (!open) {
    return (
      <div className="border-t border-border-subtle px-5 py-3">
        <Button type="button" variant="secondary" size="compact" onClick={() => setOpen(true)}>
          Ajouter un moyen
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-border-subtle bg-paper px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!chosenProvider) return;
        onSubmit({
          methodCode,
          providerCode: chosenProvider.code,
          collectionEnabled: false,
          payoutEnabled: false,
          position: (country.methods.at(-1)?.position ?? -10) + 10,
        });
        setOpen(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Moyen" htmlFor={`method-${country.code}`}>
          <Select
            id={`method-${country.code}`}
            value={methodCode}
            onValueChange={setMethodCode}
            options={catalogue.methods.map((method) => ({
              value: method.code,
              label: method.label,
              description: method.kind,
            }))}
          />
        </Field>

        <Field label="Prestataire" htmlFor={`provider-${country.code}`}>
          <Select
            id={`provider-${country.code}`}
            value={chosenProvider?.code ?? ''}
            onValueChange={setProviderCode}
            placeholder="Aucun prestataire"
            options={providers.map((provider) => ({
              value: provider.code,
              label: provider.label,
              description: provider.connected ? 'Branché' : 'Non branché',
            }))}
          />
        </Field>
      </div>

      {providers.length === 0 ? (
        <Alert tone="warning">Aucun prestataire connu ne prend en charge ce moyen.</Alert>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="ink"
          size="compact"
          loading={pending}
          disabled={!chosenProvider}
        >
          Ajouter, fermé
        </Button>
        <Button type="button" variant="tertiary" size="compact" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      <p className="text-micro text-text-3">
        Le moyen est ajouté fermé : ouvre ensuite la collecte et le versement séparément.
      </p>
    </form>
  );
}
