'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input, PhoneInput } from '@nexakabi/ui';
import { submitVerificationAction } from '../actions';

/**
 * Coordonnées de contact du dossier.
 *
 * Un seul et même formulaire sert à la première soumission et à un renvoi
 * après refus ou complément demandé — `submitVerificationAction` gère les
 * deux côté serveur, la page ne distingue pas les deux cas.
 */
export function ContactForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: { contactName: string; contactPhone: string } | null;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      action={async (formData) => {
        setPending(true);
        setError(null);
        setSuccess(false);

        const result = await submitVerificationAction(organizationId, formData);
        setPending(false);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        setSuccess(true);
        router.refresh();
      }}
    >
      <h2 className="text-h3 font-bold">Coordonnées de contact</h2>

      {error ? (
        <Alert tone="danger" title="Envoi impossible">
          {error}
        </Alert>
      ) : null}
      {success ? <Alert tone="success" title="Dossier enregistré" /> : null}

      <Field label="Nom du contact" htmlFor="contactName">
        <Input
          id="contactName"
          name="contactName"
          required
          minLength={2}
          defaultValue={initial?.contactName ?? ''}
        />
      </Field>

      <Field
        label="Téléphone"
        help="Celui qui répondra si l’équipe a besoin de préciser un point."
        htmlFor="contactPhone"
      >
        <PhoneInput id="contactPhone" name="contactPhone" defaultValue={initial?.contactPhone} />
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="mobile"
        block
        loading={pending}
        loadingLabel="Envoi…"
      >
        {initial ? 'Mettre à jour et resoumettre' : 'Envoyer le dossier'}
      </Button>
    </form>
  );
}
