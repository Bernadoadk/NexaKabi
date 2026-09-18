'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ApiError, Order } from '@nexakabi/contracts';
import { Alert, Button, Field, Input, PhoneInput, startRouteProgress } from '@nexakabi/ui';

/**
 * Coordonnées de l'acheteur.
 *
 * Le téléphone d'abord, et prérempli s'il est connu : c'est l'identifiant du
 * produit, le canal de livraison du billet et le moyen de paiement. L'e-mail
 * n'est qu'un canal de secours, il reste facultatif.
 *
 * Aucune création de compte n'est demandée ici. Elle se fera en silence après
 * l'encaissement, à partir du numéro qui a payé.
 */
export function BuyerForm({
  order,
  knownName,
  knownPhone,
}: {
  order: Order;
  knownName?: string;
  knownPhone?: string;
}) {
  const router = useRouter();

  const [name, setName] = React.useState(order.buyerName || knownName || '');
  const [phone, setPhone] = React.useState(order.buyerPhone || knownPhone || '');
  const [email, setEmail] = React.useState(order.buyerEmail ?? '');
  const [attendees, setAttendees] = React.useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      order.items.map((item) => [
        item.ticketTypeId,
        Array.from({ length: item.quantity }, () => ''),
      ]),
    ),
  );

  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const payload = {
      buyerName: name,
      buyerPhone: phone,
      buyerEmail: email || undefined,
      attendees: order.requiresAttendeeName
        ? order.items.flatMap((item) =>
            (attendees[item.ticketTypeId] ?? []).map((attendeeName) => ({
              ticketTypeId: item.ticketTypeId,
              name: attendeeName,
            })),
          )
        : undefined,
    };

    const response = await fetch(`/api/checkout/orders/${order.reference}/buyer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      setPending(false);
      setError((body as ApiError | null)?.message ?? 'Impossible d’enregistrer tes coordonnées.');
      return;
    }

    // `pending` reste vrai : le bouton ne doit pas redevenir cliquable entre
    // l'enregistrement et l'étape suivante. Le filet, lui, dit que l'étape
    // suivante est en route — l'acheteur qui ne voit rien bouger recommence.
    startRouteProgress();
    router.push(`/checkout/${order.reference}/recapitulatif`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <Alert tone="danger" title="Impossible de continuer">
          {error}
        </Alert>
      ) : null}

      <Field label="Numéro de téléphone" help="C’est sur ce numéro que ton billet sera envoyé.">
        {/* Non contrôlé : le champ reformate la saisie à chaque frappe, et lui
            réinjecter la valeur normalisée déplacerait le curseur. */}
        <PhoneInput
          defaultValue={phone}
          onValueChange={(e164, raw) => setPhone(e164 ?? raw)}
          autoFocus={!phone}
          required
        />
      </Field>

      <Field label="Nom complet">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex. Kossi Adjovi"
          autoComplete="name"
          required
        />
      </Field>

      <Field label="E-mail" hint="Facultatif · reçu et copie de secours du billet">
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ex. kossi@example.bj"
          autoComplete="email"
        />
      </Field>

      {order.requiresAttendeeName ? (
        <fieldset className="flex flex-col gap-3 rounded-card border border-border-subtle p-4">
          <legend className="px-1 text-body-s font-bold">Nom sur chaque billet</legend>
          <p className="text-micro text-text-3">
            Cet organisateur contrôle l’identité à l’entrée : chaque billet doit porter le nom de
            son porteur.
          </p>

          {order.items.map((item) =>
            Array.from({ length: item.quantity }, (_, index) => (
              <Field
                key={`${item.ticketTypeId}-${index}`}
                label={`${item.ticketTypeName} · billet ${index + 1}`}
              >
                <Input
                  value={attendees[item.ticketTypeId]?.[index] ?? ''}
                  onChange={(event) =>
                    setAttendees((current) => {
                      const names = [...(current[item.ticketTypeId] ?? [])];
                      names[index] = event.target.value;
                      return { ...current, [item.ticketTypeId]: names };
                    })
                  }
                  placeholder="Nom et prénom"
                  required
                />
              </Field>
            )),
          )}
        </fieldset>
      ) : null}

      <Button type="submit" variant="primary" size="primary" block loading={pending}>
        Voir le récapitulatif
      </Button>
    </form>
  );
}
