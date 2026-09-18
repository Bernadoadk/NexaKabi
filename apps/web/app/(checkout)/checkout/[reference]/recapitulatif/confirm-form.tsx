'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ApiError, Order } from '@nexakabi/contracts';
import { Alert, Button, startRouteProgress } from '@nexakabi/ui';

/**
 * Acceptation et passage au paiement.
 *
 * Les conditions sont acceptées ICI, après que le montant a été affiché : une
 * case cochée avant de connaître la somme engagée n'a aucune valeur, ni morale
 * ni juridique.
 *
 * L'opt-in WhatsApp est présenté séparément et déjà coché : c'est le canal de
 * livraison attendu sur ce marché, et le décocher reste possible d'un geste.
 */
export function ConfirmForm({ order }: { order: Order }) {
  const router = useRouter();

  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch(`/api/checkout/orders/${order.reference}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termsAccepted, whatsappOptIn }),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      setPending(false);
      setError((body as ApiError | null)?.message ?? 'Impossible de confirmer la commande.');
      return;
    }

    // La commande est confirmée côté serveur : à partir d'ici, recliquer
    // n'apporterait rien et inquiéterait. Le filet occupe l'attente.
    startRouteProgress();
    router.push(`/checkout/${order.reference}/paiement`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <Alert tone="danger" title="Impossible de continuer">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        <Check checked={whatsappOptIn} onChange={setWhatsappOptIn}>
          Recevoir mon billet et les rappels sur WhatsApp au{' '}
          <span className="font-semibold">{order.buyerPhone}</span>
        </Check>

        <Check checked={termsAccepted} onChange={setTermsAccepted} required>
          J’accepte les{' '}
          <Link href="/cgv" className="font-semibold underline underline-offset-2">
            conditions de vente
          </Link>{' '}
          et la politique de remboursement de cet événement.
        </Check>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="primary"
        block
        loading={pending}
        disabled={!termsAccepted}
      >
        Choisir mon moyen de paiement
      </Button>
    </form>
  );
}

/**
 * Case à cocher.
 *
 * Zone cliquable étendue à toute la ligne : sur un téléphone tenu d'une main,
 * viser une case de 16 px est une source d'échec réelle.
 */
function Check({
  checked,
  onChange,
  required,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-card border border-border-subtle px-4 py-3 transition hover:border-border">
      <input
        type="checkbox"
        checked={checked}
        required={required}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 accent-coral"
      />
      <span className="text-body-s text-text-2">{children}</span>
    </label>
  );
}
