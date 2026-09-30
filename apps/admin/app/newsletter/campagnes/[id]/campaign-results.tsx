'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy, RotateCcw, Square } from 'lucide-react';
import type { NewsletterCampaignDetail } from '@nexakabi/contracts';
import { Alert, Button, Surface, startRouteProgress } from '@nexakabi/ui';

/**
 * Une campagne partie : où en est l'envoi, ce qui a raté, et les gestes
 * encore possibles — arrêter, relancer les échecs, repartir d'une copie.
 *
 * Pendant l'envoi, la page se rafraîchit seule toutes les cinq secondes :
 * suivre une campagne ne doit pas demander de recharger à la main.
 */
export function CampaignResults({
  campaign,
  canAct,
}: {
  campaign: NewsletterCampaignDetail;
  canAct: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmStop, setConfirmStop] = React.useState(false);

  const sending = campaign.status === 'SENDING';

  React.useEffect(() => {
    if (!sending) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [sending, router]);

  async function call(label: string, path: string): Promise<NewsletterCampaignDetail | null> {
    setBusy(label);
    setError(null);

    try {
      const response = await fetch(`/api/admin/newsletter/campaigns/${campaign.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      const payload = (await response.json().catch(() => null)) as
        (NewsletterCampaignDetail & { message?: string }) | null;

      if (!response.ok || !payload) {
        setError(payload?.message ?? 'L’opération n’a pas abouti.');
        return null;
      }

      return payload;
    } catch {
      setError('L’API n’est pas joignable.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  const done = campaign.sentCount + campaign.failedCount + campaign.skippedCount;
  const progress =
    campaign.recipientCount > 0 ? Math.round((done / campaign.recipientCount) * 100) : 100;

  return (
    <div className="flex flex-col gap-4">
      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
        <h2 className="text-h3 font-bold">Envoi</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Destinataires" value={campaign.recipientCount} />
          <Figure label="Envoyés" value={campaign.sentCount} tone="success" />
          <Figure label="En attente" value={campaign.queuedCount} />
          <Figure
            label="Échecs"
            value={campaign.failedCount}
            tone={campaign.failedCount > 0 ? 'danger' : undefined}
          />
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-fill-muted"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avancement de l’envoi"
        >
          <div
            className="h-full rounded-full bg-coral transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-micro text-text-3">
          {sending
            ? 'Envoi par lots, un lot par minute : le fournisseur d’e-mail n’accepte que quelques adresses par seconde.'
            : campaign.skippedCount > 0
              ? `${campaign.skippedCount} adresse${campaign.skippedCount > 1 ? 's' : ''} sautée${campaign.skippedCount > 1 ? 's' : ''} : désabonnée${campaign.skippedCount > 1 ? 's' : ''} entre-temps, ou envoi arrêté.`
              : 'Toutes les adresses ont été traitées.'}
        </p>

        {campaign.recentFailures.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-card bg-paper p-3">
            <p className="text-micro font-bold uppercase tracking-wide text-text-3">
              Dernières erreurs du fournisseur
            </p>
            <ul className="flex flex-col gap-1">
              {campaign.recentFailures.map((failure, index) => (
                <li key={`${failure.email}-${index}`} className="text-body-s">
                  <span className="font-semibold">{failure.email}</span>
                  <span className="text-text-2"> — {failure.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Surface>

      {canAct ? (
        <div className="flex flex-wrap gap-2">
          {sending ? (
            confirmStop ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  loading={busy === 'cancel'}
                  loadingLabel="Arrêt…"
                  disabled={busy !== null}
                  onClick={() =>
                    void call('cancel', 'cancel').then((result) => {
                      setConfirmStop(false);
                      if (result) router.refresh();
                    })
                  }
                >
                  Confirmer l’arrêt ({campaign.queuedCount} en attente)
                </Button>
                <Button type="button" variant="tertiary" onClick={() => setConfirmStop(false)}>
                  Continuer l’envoi
                </Button>
              </>
            ) : (
              <Button type="button" variant="destructive" onClick={() => setConfirmStop(true)}>
                <Square className="size-4" aria-hidden />
                Arrêter l’envoi
              </Button>
            )
          ) : null}

          {campaign.failedCount > 0 && campaign.status !== 'CANCELLED' ? (
            <Button
              type="button"
              variant="secondary"
              loading={busy === 'retry'}
              loadingLabel="Relance…"
              disabled={busy !== null}
              onClick={() =>
                void call('retry', 'retry').then((result) => {
                  if (result) router.refresh();
                })
              }
            >
              <RotateCcw className="size-4" aria-hidden />
              Relancer les {campaign.failedCount} échec{campaign.failedCount > 1 ? 's' : ''}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="tertiary"
            loading={busy === 'duplicate'}
            loadingLabel="Copie…"
            disabled={busy !== null}
            onClick={() =>
              void call('duplicate', 'duplicate').then((result) => {
                if (!result) return;
                startRouteProgress();
                router.push(`/newsletter/campagnes/${result.id}`);
              })
            }
          >
            <Copy className="size-4" aria-hidden />
            Dupliquer
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" title="Impossible pour l’instant">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card bg-paper p-3">
      <span className="text-micro font-semibold text-text-3">{label}</span>
      <span
        className={
          tone === 'danger'
            ? 'font-display text-[26px] font-bold tabular-nums text-red-700'
            : tone === 'success'
              ? 'font-display text-[26px] font-bold tabular-nums text-mint-700'
              : 'font-display text-[26px] font-bold tabular-nums'
        }
      >
        {value.toLocaleString('fr-FR')}
      </span>
    </div>
  );
}
