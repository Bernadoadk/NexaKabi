'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input, Surface } from '@nexakabi/ui';

/**
 * Connexion en deux étapes.
 *
 * ── Pourquoi la seconde étape est un écran, pas une case ─────────────────
 * Le mot de passe n'ouvre RIEN : il produit une session inutilisable tant que
 * le code n'est pas validé. Montrer les deux champs ensemble laisserait croire
 * que le second est une formalité, et la première demande d'assouplissement
 * arriverait dans le mois.
 *
 * ── Ce que l'écran ne fait pas ───────────────────────────────────────────
 * Pas de « rester connecté », pas de récupération de mot de passe en libre
 * service. Une console qui donne accès aux pièces d'identité de tous les
 * organisateurs n'a pas de parcours de récupération automatique : un autre
 * administrateur réinitialise, ou personne.
 */
export function LoginFlow() {
  const router = useRouter();
  const [step, setStep] = React.useState<'credentials' | 'totp'>('credentials');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submitCredentials(formData: FormData) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(formData.get('email') ?? ''),
          password: String(formData.get('password') ?? ''),
        }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'Connexion impossible.');
        return;
      }

      setStep('totp');
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
    }
  }

  async function submitTotp(formData: FormData) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: String(formData.get('code') ?? '') }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'Code incorrect.');
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
        <p className="text-body-s text-text-2">
          {step === 'credentials'
            ? 'Accès réservé à l’équipe Nexa-Kabi.'
            : 'Saisis le code affiché par ton application d’authentification.'}
        </p>
      </header>

      <Surface variant="panel" padding="comfortable">
        {step === 'credentials' ? (
          <form action={submitCredentials} className="flex flex-col gap-4">
            <Field label="Adresse e-mail" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
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

            <Button type="submit" variant="primary" size="primary" block disabled={pending}>
              {pending ? 'Vérification…' : 'Continuer'}
            </Button>
          </form>
        ) : (
          <form action={submitTotp} className="flex flex-col gap-4">
            <Field
              label="Code à six chiffres"
              htmlFor="code"
              hint="Ou l’un de tes codes de secours, si tu n’as pas ton téléphone."
            >
              <Input
                id="code"
                name="code"
                inputMode="text"
                autoComplete="one-time-code"
                // Le champ accepte aussi un code de secours au format
                // `XXXX-XXXX` : le limiter à six chiffres enfermerait dehors
                // quelqu'un dont le téléphone est perdu, exactement au moment
                // où il en a besoin.
                maxLength={20}
                required
                autoFocus
              />
            </Field>

            <Button type="submit" variant="primary" size="primary" block disabled={pending}>
              {pending ? 'Vérification…' : 'Ouvrir la session'}
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setError(null);
              }}
              className="min-h-8 text-micro text-text-3 hover:text-text-strong"
            >
              ← Recommencer
            </button>
          </form>
        )}
      </Surface>

      {error ? (
        <Alert tone="danger" title="Connexion refusée">
          {error}
        </Alert>
      ) : null}

      <p className="text-micro leading-relaxed text-text-3">
        Chaque connexion est journalisée, réussie ou non. Les accès aux pièces d’identité des
        organisateurs sont tracés individuellement.
      </p>
    </div>
  );
}
