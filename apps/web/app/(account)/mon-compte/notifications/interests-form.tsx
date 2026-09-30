'use client';

import * as React from 'react';
import Link from 'next/link';
import type { UserInterests } from '@nexakabi/contracts';
import { Button, Surface } from '@nexakabi/ui';
import { InterestPicker, type InterestOption } from '@/components/interest-picker';

/**
 * Mes goûts — les catégories et les villes de la sélection « Pour toi ».
 *
 * Ici, un bouton « Enregistrer » plutôt qu'un enregistrement à chaque toucher :
 * on compose une liste, on ne bascule pas un réglage. Enregistrer à chaque
 * puce enverrait six requêtes pour une seule intention, et une coupure au
 * milieu laisserait une liste à moitié écrite.
 */
export function InterestsForm({
  categories,
  cities,
  initial,
}: {
  categories: readonly InterestOption[];
  cities: readonly InterestOption[];
  initial: UserInterests;
}) {
  const [value, setValue] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const dirty =
    !sameSet(value.categoryIds, saved.categoryIds) || !sameSet(value.cityIds, saved.cityIds);

  async function save() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch('/api/me/interests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });

      const payload = (await response.json().catch(() => null)) as
        (UserInterests & { message?: string }) | null;

      if (!response.ok || !payload) {
        setMessage({
          tone: 'error',
          text: payload?.message ?? 'Tes goûts n’ont pas pu être enregistrés.',
        });
        return;
      }

      setSaved({ categoryIds: payload.categoryIds, cityIds: payload.cityIds });
      setMessage({ tone: 'ok', text: 'Tes goûts sont enregistrés.' });
    } catch {
      setMessage({ tone: 'error', text: 'L’API n’est pas joignable.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-bold">Mes goûts</h2>
        <p className="text-body-s text-text-2">
          Ils composent ta{' '}
          <Link href="/mon-compte/pour-toi" className="font-semibold">
            sélection « Pour toi »
          </Link>
          . Rien choisi : tout te sera proposé.
        </p>
      </div>

      <InterestPicker
        categories={categories}
        cities={cities}
        value={value}
        onChange={(next) => {
          setValue(next);
          setMessage(null);
        }}
        disabled={pending}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="mobile"
          loading={pending}
          loadingLabel="Enregistrement…"
          disabled={!dirty}
          onClick={() => void save()}
        >
          Enregistrer mes goûts
        </Button>

        {message ? (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={
              message.tone === 'error'
                ? 'text-body-s font-semibold text-red-700'
                : 'text-body-s font-semibold text-mint-700'
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </Surface>
  );
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry) => b.includes(entry));
}
