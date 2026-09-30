'use client';

import * as React from 'react';
import { Mail } from 'lucide-react';
import { Button, Input } from '@nexakabi/ui';

/**
 * Inscription à la newsletter, en pied de page — sans compte.
 *
 * La réponse est la même que l'adresse soit nouvelle ou déjà inscrite : dire
 * « déjà abonné » révélerait à n'importe qui qui reçoit notre newsletter.
 * Dans tous les cas, rien ne part avant que le lien de confirmation soit ouvert.
 */
export function NewsletterSignup() {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'pending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('pending');
    setMessage(null);

    try {
      const response = await fetch('/api/newsletter/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          fields?: Record<string, string[]>;
        } | null;

        setState('error');
        setMessage(
          payload?.fields?.email?.[0] ??
            payload?.message ??
            'L’inscription n’a pas pu être enregistrée. Réessaie dans un instant.',
        );
        return;
      }

      setState('sent');
      setEmail('');
    } catch {
      setState('error');
      setMessage('Le service n’est pas joignable. Réessaie dans un instant.');
    }
  }

  if (state === 'sent') {
    return (
      <div role="status" className="flex max-w-[420px] flex-col gap-1">
        <p className="text-body-s font-bold text-text-strong">Vérifie ta boîte mail</p>
        <p className="text-body-s text-text-2">
          Un lien de confirmation vient de partir. Rien ne te sera envoyé avant que tu l’aies
          ouvert.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex max-w-[420px] flex-col gap-2">
      <label htmlFor="newsletter-email" className="text-body-s font-bold text-text-strong">
        La newsletter Nexa‑Kabi
      </label>
      <p className="text-micro text-text-3">Les sorties à ne pas manquer, par e-mail.</p>
      <div className="flex gap-2">
        <Input
          id="newsletter-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="ton@adresse.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="ink"
          loading={state === 'pending'}
          loadingLabel="Envoi…"
          aria-label="S’inscrire à la newsletter"
        >
          <Mail className="size-4" aria-hidden />
          <span className="hidden sm:inline">S’inscrire</span>
        </Button>
      </div>
      {message ? (
        <p role="alert" className="text-micro font-semibold text-red-700">
          {message}
        </p>
      ) : null}
    </form>
  );
}
