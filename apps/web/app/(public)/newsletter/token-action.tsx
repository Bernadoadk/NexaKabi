'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, MailX } from 'lucide-react';
import type { NewsletterTokenResult } from '@nexakabi/contracts';
import { Alert, Button, Surface } from '@nexakabi/ui';

/**
 * Le bouton d'un lien reçu par e-mail : confirmer, ou se désabonner.
 *
 * ── Pourquoi un bouton, et pas l'action à l'ouverture du lien ──────────────
 * Les antivirus des messageries d'entreprise et les aperçus de liens ouvrent
 * les URL d'un e-mail AVANT la personne. Une action faite à l'ouverture serait
 * faite par eux : une inscription confirmée par un robot n'est pas un
 * consentement, et un désabonnement fait à l'insu de quelqu'un non plus.
 */
export function TokenAction({
  token,
  action,
  initial,
}: {
  token: string;
  action: 'confirm' | 'unsubscribe';
  initial: NewsletterTokenResult;
}) {
  const [result, setResult] = React.useState(initial);
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/newsletter/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const payload = (await response.json().catch(() => null)) as
        (NewsletterTokenResult & { message?: string }) | null;

      if (!response.ok || !payload) {
        setError(payload?.message ?? 'Réessaie dans un instant.');
        return;
      }

      setResult({ status: payload.status, maskedEmail: payload.maskedEmail });
      setDone(true);
    } catch {
      setError('Le service n’est pas joignable. Réessaie dans un instant.');
    } finally {
      setPending(false);
    }
  }

  if (action === 'confirm') {
    if (result.status === 'ACTIVE') {
      return (
        <Outcome
          icon={<CheckCircle2 className="size-6" />}
          title={done ? 'C’est confirmé' : 'Adresse déjà confirmée'}
          text={`La newsletter Nexa‑Kabi arrivera à ${result.maskedEmail}. Chaque envoi contient un lien pour te désabonner.`}
        />
      );
    }

    if (result.status === 'UNSUBSCRIBED') {
      return (
        <Outcome
          icon={<MailX className="size-6" />}
          title="Tu t’es désabonné depuis"
          text="Ce lien date d’avant ton désabonnement : il ne te réinscrit pas. Pour recevoir de nouveau la newsletter, inscris-toi en bas de n’importe quelle page."
        />
      );
    }

    return (
      <Prompt
        title="Confirmer ton inscription"
        text={`Tu vas recevoir la newsletter Nexa‑Kabi à ${result.maskedEmail} : les sorties à ne pas manquer, de temps en temps.`}
        buttonLabel="Confirmer mon adresse"
        pending={pending}
        error={error}
        onClick={() => void run()}
      />
    );
  }

  if (result.status === 'UNSUBSCRIBED') {
    return (
      <Outcome
        icon={<MailX className="size-6" />}
        title={done ? 'Tu es désabonné' : 'Déjà désabonné'}
        text={`Plus aucune newsletter ne sera envoyée à ${result.maskedEmail}. Tes alertes de billets, elles, ne changent pas.`}
      />
    );
  }

  return (
    <Prompt
      title="Se désabonner de la newsletter"
      text={`Plus aucune newsletter ne sera envoyée à ${result.maskedEmail}. Tes billets et leurs alertes ne sont pas concernés.`}
      buttonLabel="Me désabonner"
      pending={pending}
      error={error}
      onClick={() => void run()}
    />
  );
}

function Prompt({
  title,
  text,
  buttonLabel,
  pending,
  error,
  onClick,
}: {
  title: string;
  text: string;
  buttonLabel: string;
  pending: boolean;
  error: string | null;
  onClick: () => void;
}) {
  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
      <h1 className="font-display text-h2 font-bold">{title}</h1>
      <p className="text-body text-text-2">{text}</p>
      {error ? (
        <Alert tone="danger" title="Impossible pour l’instant">
          {error}
        </Alert>
      ) : null}
      <Button
        type="button"
        variant="primary"
        size="primary"
        loading={pending}
        loadingLabel="Un instant…"
        onClick={onClick}
        className="self-start"
      >
        {buttonLabel}
      </Button>
    </Surface>
  );
}

function Outcome({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
      <span className="grid size-11 place-items-center rounded-full bg-mint-50 text-mint-700">
        {icon}
      </span>
      <h1 className="font-display text-h2 font-bold">{title}</h1>
      <p className="text-body text-text-2">{text}</p>
      <Link href="/evenements" className="self-start text-body-s font-semibold">
        Voir les événements →
      </Link>
    </Surface>
  );
}
