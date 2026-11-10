'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { SpotlightSettings } from '@nexakabi/contracts';
import { Button, Field, Input, Surface, cn } from '@nexakabi/ui';

interface Country {
  code: string;
  name: string;
  flag: string;
  currency: string;
}

/**
 * Réglages de la une — valables pour Découvrir et l'accueil.
 *
 * Les interrupteurs (mention « Sponsorisé », vente ouverte) s'enregistrent
 * d'un geste ; les nombres et les tarifs, ensemble, au bouton. Chaque
 * modification est tracée au journal.
 */
export function SpotlightSettingsCard({
  initial,
  countries,
  canAct,
}: {
  initial: SpotlightSettings;
  countries: Country[];
  canAct: boolean;
}) {
  const router = useRouter();
  const [settings, setSettings] = React.useState(initial);
  const [numbers, setNumbers] = React.useState(() => toForm(initial, countries));
  const [pending, setPending] = React.useState<'switch' | 'numbers' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  async function save(patch: Partial<SpotlightSettings>, what: 'switch' | 'numbers') {
    setPending(what);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch('/api/admin/spotlights/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json().catch(() => null)) as
        (SpotlightSettings & { message?: string }) | null;

      if (!response.ok || !payload) {
        setError(payload?.message ?? 'Le réglage n’a pas pu être enregistré.');
        return false;
      }

      setSettings(payload);
      setNumbers(toForm(payload, countries));
      setSaved(what === 'numbers');
      router.refresh();
      return true;
    } catch {
      setError('L’API n’est pas joignable.');
      return false;
    } finally {
      setPending(null);
    }
  }

  const parsed = fromForm(numbers);
  const dirty = parsed !== null && JSON.stringify(parsed) !== JSON.stringify(pick(settings));

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
      <h2 className="text-h3 font-bold">Réglages de la une</h2>

      <Switch
        label="Mention « Sponsorisé »"
        help="Affichée sur les places payées. Coupée, elles paraissent comme les autres."
        checked={settings.showSponsoredLabel}
        disabled={!canAct || pending !== null}
        busy={pending === 'switch'}
        onToggle={() => void save({ showSponsoredLabel: !settings.showSponsoredLabel }, 'switch')}
      />

      <Switch
        label="Vente aux organisateurs"
        help="Ouverte : les organisations vérifiées achètent des places depuis l’onglet « Mise en avant » de leurs événements."
        checked={settings.salesEnabled}
        disabled={!canAct || pending !== null}
        busy={pending === 'switch'}
        onToggle={() => void save({ salesEnabled: !settings.salesEnabled }, 'switch')}
      />

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed) void save(parsed, 'numbers');
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="spotlight-max"
            label="Places à la une"
            help="De 1 à 8, par pays."
            value={numbers.maxSlides}
            disabled={!canAct}
            onChange={(value) => setNumbers((current) => ({ ...current, maxSlides: value }))}
          />
          <NumberField
            id="spotlight-seconds"
            label="Secondes par diapositive"
            help="De 4 à 15."
            value={numbers.slideSeconds}
            disabled={!canAct}
            onChange={(value) => setNumbers((current) => ({ ...current, slideSeconds: value }))}
          />
          <NumberField
            id="spotlight-paid"
            label="Places vendables par jour"
            help="Le reste revient à l’équipe."
            value={numbers.paidSlotsPerDay}
            disabled={!canAct}
            onChange={(value) => setNumbers((current) => ({ ...current, paidSlotsPerDay: value }))}
          />
          <NumberField
            id="spotlight-lead"
            label="Délai avant diffusion"
            help="En jours : 2 = après-demain, le temps de valider."
            value={numbers.minLeadDays}
            disabled={!canAct}
            onChange={(value) => setNumbers((current) => ({ ...current, minLeadDays: value }))}
          />
          <NumberField
            id="spotlight-max-days"
            label="Jours par demande"
            help="Au plus."
            value={numbers.maxDaysPerBooking}
            disabled={!canAct}
            onChange={(value) =>
              setNumbers((current) => ({ ...current, maxDaysPerBooking: value }))
            }
          />
          <NumberField
            id="spotlight-horizon"
            label="Réservable jusqu’à"
            help="En jours à partir d’aujourd’hui."
            value={numbers.horizonDays}
            disabled={!canAct}
            onChange={(value) => setNumbers((current) => ({ ...current, horizonDays: value }))}
          />
        </div>

        <fieldset className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <legend className="pb-1 text-body-s font-semibold">Prix d’un jour, par pays</legend>
          <p className="text-micro text-text-3">
            Vide : la vente n’est pas ouverte dans ce pays. Un prix changé ne touche pas les places
            déjà vendues.
          </p>
          {countries.map((country) => (
            <div key={country.code} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-body-s">
                {country.flag} {country.name}
              </span>
              <Input
                aria-label={`Prix d’un jour — ${country.name}`}
                type="number"
                inputMode="numeric"
                min={100}
                value={numbers.prices[country.code] ?? ''}
                disabled={!canAct}
                onChange={(event) =>
                  setNumbers((current) => ({
                    ...current,
                    prices: { ...current.prices, [country.code]: event.target.value },
                  }))
                }
              />
              <span className="shrink-0 text-micro text-text-3">{country.currency}</span>
            </div>
          ))}
        </fieldset>

        {canAct ? (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="secondary"
              size="compact"
              loading={pending === 'numbers'}
              disabled={!parsed || !dirty || pending !== null}
            >
              Enregistrer
            </Button>
            {saved && !dirty ? (
              <span className="text-micro font-semibold text-mint-700">Enregistré</span>
            ) : null}
            {!parsed ? (
              <span className="text-micro font-semibold text-amber-700">
                Une valeur est hors limites.
              </span>
            ) : null}
          </div>
        ) : null}
      </form>

      {error ? (
        <p role="alert" className="text-body-s font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type NumberKey =
  | 'maxSlides'
  | 'slideSeconds'
  | 'paidSlotsPerDay'
  | 'minLeadDays'
  | 'horizonDays'
  | 'maxDaysPerBooking';

type FormState = Record<NumberKey, string> & { prices: Record<string, string> };

const BOUNDS: Record<NumberKey, [number, number]> = {
  maxSlides: [1, 8],
  slideSeconds: [4, 15],
  paidSlotsPerDay: [0, 8],
  minLeadDays: [1, 14],
  horizonDays: [7, 180],
  maxDaysPerBooking: [1, 60],
};

function toForm(settings: SpotlightSettings, countries: Country[]): FormState {
  return {
    maxSlides: String(settings.maxSlides),
    slideSeconds: String(settings.slideSeconds),
    paidSlotsPerDay: String(settings.paidSlotsPerDay),
    minLeadDays: String(settings.minLeadDays),
    horizonDays: String(settings.horizonDays),
    maxDaysPerBooking: String(settings.maxDaysPerBooking),
    prices: Object.fromEntries(
      countries.map((country) => [
        country.code,
        settings.pricePerDay[country.code] !== undefined
          ? String(settings.pricePerDay[country.code])
          : '',
      ]),
    ),
  };
}

/** Ce que les champs numériques de la carte enregistrent — `null` si une valeur est hors limites. */
function fromForm(form: FormState): Pick<SpotlightSettings, NumberKey | 'pricePerDay'> | null {
  const values = {} as Record<NumberKey, number>;

  for (const key of Object.keys(BOUNDS) as NumberKey[]) {
    const value = Number.parseInt(form[key], 10);
    const [min, max] = BOUNDS[key];
    if (!Number.isInteger(value) || value < min || value > max) return null;
    values[key] = value;
  }

  if (values.paidSlotsPerDay > values.maxSlides) return null;

  const pricePerDay: Record<string, number> = {};
  for (const [code, raw] of Object.entries(form.prices)) {
    if (raw.trim() === '') continue;
    const price = Number.parseInt(raw, 10);
    if (!Number.isInteger(price) || price < 100 || price > 1_000_000) return null;
    pricePerDay[code] = price;
  }

  return { ...values, pricePerDay };
}

function pick(settings: SpotlightSettings): Pick<SpotlightSettings, NumberKey | 'pricePerDay'> {
  return {
    maxSlides: settings.maxSlides,
    slideSeconds: settings.slideSeconds,
    paidSlotsPerDay: settings.paidSlotsPerDay,
    minLeadDays: settings.minLeadDays,
    horizonDays: settings.horizonDays,
    maxDaysPerBooking: settings.maxDaysPerBooking,
    pricePerDay: settings.pricePerDay,
  };
}

function NumberField({
  id,
  label,
  help,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} help={help} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function Switch({
  label,
  help,
  checked,
  disabled,
  busy,
  onToggle,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-s font-semibold">{label}</span>
        <span className="text-micro leading-snug text-text-3">{help}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          'before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[""]',
          checked ? 'bg-coral' : 'bg-border',
          disabled && !busy && 'cursor-not-allowed opacity-45',
          busy && 'cursor-wait opacity-70',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-[left]',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}
