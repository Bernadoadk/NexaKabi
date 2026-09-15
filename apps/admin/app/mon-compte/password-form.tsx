'use client';

import * as React from 'react';
import { Alert, Button, Field, Input } from '@nexakabi/ui';

const MIN_PASSWORD = 12;

export function PasswordForm() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3.5"
      action={async (formData) => {
        const currentPassword = String(formData.get('current') ?? '');
        const newPassword = String(formData.get('next') ?? '');
        const confirm = String(formData.get('confirm') ?? '');

        setDone(false);

        if (newPassword.length < MIN_PASSWORD) {
          setError(`Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
          return;
        }
        if (newPassword !== confirm) {
          setError('Les deux saisies du nouveau mot de passe ne correspondent pas.');
          return;
        }

        setPending(true);
        setError(null);

        try {
          const response = await fetch('/api/admin/auth/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword }),
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { message?: string } | null;
            setError(payload?.message ?? 'Changement impossible.');
            return;
          }

          setDone(true);
          formRef.current?.reset();
        } catch {
          setError('L’API n’est pas joignable.');
        } finally {
          setPending(false);
        }
      }}
    >
      {error ? (
        <Alert tone="danger" title="Changement impossible">
          {error}
        </Alert>
      ) : null}
      {done ? (
        <Alert tone="success" title="Mot de passe changé">
          Tes autres sessions ont été fermées.
        </Alert>
      ) : null}

      <Field label="Mot de passe actuel" htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Nouveau mot de passe" htmlFor="next">
          <Input
            id="next"
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
        </Field>
        <Field label="Confirmation" htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
        </Field>
      </div>

      <Button type="submit" variant="ink" size="mobile" className="self-start" loading={pending} loadingLabel="Enregistrement…">
        Changer le mot de passe
      </Button>
    </form>
  );
}
