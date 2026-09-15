'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input, Surface } from '@nexakabi/ui';

/**
 * Connexion : identifiant et mot de passe, en une étape.
 *
 * ── Ce que l'écran ne fait pas ───────────────────────────────────────────
 * Pas de « rester connecté », pas de récupération de mot de passe en libre
 * service. Une console qui donne accès aux pièces d'identité de tous les
 * organisateurs n'a pas de parcours de récupération automatique : le
 * propriétaire réinitialise depuis l'écran Équipe, ou personne.
 */
export function LoginFlow() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(formData.get('username') ?? '')
            .trim()
            .toLowerCase(),
          password: String(formData.get('password') ?? ''),
        }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'Connexion impossible.');
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-[8px] bg-ink font-display text-[13px] font-extrabold text-white">
            N
          </span>
          <span className="font-display text-[17px] font-bold tracking-[-0.02em]">
            Administration
          </span>
        </div>
        <p className="text-body-s text-text-2">Accès réservé à l’équipe Nexa-Kabi.</p>
      </header>

      <Surface variant="panel" padding="comfortable">
        <form action={submit} className="flex flex-col gap-4">
          <Field label="Identifiant" htmlFor="username" help="De la forme nom.staff@xxxx">
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="awa.staff@7k2p"
              required
              autoFocus
            />
          </Field>

          <Field label="Mot de passe" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          {error ? (
            <Alert tone="danger" title="Connexion refusée">
              {error}
            </Alert>
          ) : null}

          <Button type="submit" variant="primary" size="primary" block disabled={pending}>
            {pending ? 'Vérification…' : 'Se connecter'}
          </Button>
        </form>
      </Surface>

      <p className="text-center text-micro text-text-3">
        Mot de passe oublié ? Le propriétaire de la plateforme peut le réinitialiser.
      </p>
    </div>
  );
}
