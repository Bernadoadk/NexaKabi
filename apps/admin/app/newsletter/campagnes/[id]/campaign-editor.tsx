'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Copy, Save, Send, Trash2 } from 'lucide-react';
import type { NewsletterCampaignDetail, NewsletterEvent } from '@nexakabi/contracts';
import { formatDateShort, formatTimeCompact } from '@nexakabi/utils';
import { Alert, Button, Field, Input, Surface, Textarea, startRouteProgress } from '@nexakabi/ui';
import { EventPicker } from './event-picker';

interface Draft {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  events: NewsletterEvent[];
}

function toDraft(campaign: NewsletterCampaignDetail): Draft {
  return {
    subject: campaign.subject,
    preheader: campaign.preheader ?? '',
    heading: campaign.heading ?? '',
    body: campaign.body,
    ctaLabel: campaign.ctaLabel ?? '',
    ctaUrl: campaign.ctaUrl ?? '',
    events: campaign.events,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.subject === b.subject &&
    a.preheader === b.preheader &&
    a.heading === b.heading &&
    a.body === b.body &&
    a.ctaLabel === b.ctaLabel &&
    a.ctaUrl === b.ctaUrl &&
    a.events.map((event) => event.id).join() === b.events.map((event) => event.id).join()
  );
}

/**
 * Rédaction d'une campagne — brouillon ou programmée.
 *
 * ── L'ordre des gestes ──────────────────────────────────────────────────────
 * Écrire, enregistrer (l'aperçu à droite est celui de la version
 * ENREGISTRÉE), s'envoyer un test, puis envoyer ou programmer. Envoyer
 * demande que tout soit enregistré : partir avec une version que l'aperçu ne
 * montre pas, c'est découvrir le contenu en même temps que les abonnés.
 *
 * L'envoi se confirme en deux temps, avec le nombre d'adresses sous les yeux :
 * un clic de trop, ici, ne se rattrape pas.
 */
export function CampaignEditor({
  campaign,
  audience,
}: {
  campaign: NewsletterCampaignDetail;
  audience: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(() => toDraft(campaign));
  const [saved, setSaved] = React.useState(() => toDraft(campaign));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [testEmail, setTestEmail] = React.useState('');
  const [scheduleAt, setScheduleAt] = React.useState('');
  const [confirmSend, setConfirmSend] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const dirty = !sameDraft(draft, saved);
  const scheduled = campaign.status === 'SCHEDULED';

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  async function call<T>(
    label: string,
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<T | null> {
    setBusy(label);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/newsletter/${path}`, {
        method: init.method,
        headers: { 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });

      const payload = (await response.json().catch(() => null)) as
        (T & { message?: string; fields?: Record<string, string[]> }) | null;

      if (!response.ok) {
        const firstField = payload?.fields ? Object.values(payload.fields)[0]?.[0] : undefined;
        setError(firstField ?? payload?.message ?? 'L’opération n’a pas abouti.');
        return null;
      }

      return payload as T;
    } catch {
      setError('L’API n’est pas joignable.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<boolean> {
    const result = await call<NewsletterCampaignDetail>('save', `campaigns/${campaign.id}`, {
      method: 'PATCH',
      body: {
        subject: draft.subject,
        preheader: draft.preheader || null,
        heading: draft.heading || null,
        body: draft.body,
        ctaLabel: draft.ctaLabel || null,
        ctaUrl: draft.ctaUrl || null,
        eventIds: draft.events.map((event) => event.id),
      },
    });

    if (!result) return false;

    const next = toDraft(result);
    setDraft(next);
    setSaved(next);
    setNotice('Brouillon enregistré. L’aperçu est à jour.');
    router.refresh();
    return true;
  }

  async function sendTest() {
    const result = await call<{ sent: boolean }>('test', `campaigns/${campaign.id}/test`, {
      method: 'POST',
      body: { email: testEmail.trim() },
    });

    if (result) setNotice(`Test envoyé à ${testEmail.trim()}.`);
  }

  async function send(scheduledAt?: string) {
    const result = await call<NewsletterCampaignDetail>('send', `campaigns/${campaign.id}/send`, {
      method: 'POST',
      body: scheduledAt ? { scheduledAt } : {},
    });

    setConfirmSend(false);
    if (result) router.refresh();
  }

  async function unschedule() {
    const result = await call<NewsletterCampaignDetail>(
      'cancel',
      `campaigns/${campaign.id}/cancel`,
      {
        method: 'POST',
        body: {},
      },
    );
    if (result) router.refresh();
  }

  async function duplicate() {
    const result = await call<NewsletterCampaignDetail>(
      'duplicate',
      `campaigns/${campaign.id}/duplicate`,
      { method: 'POST', body: {} },
    );

    if (result) {
      startRouteProgress();
      router.push(`/newsletter/campagnes/${result.id}`);
    }
  }

  async function remove() {
    const result = await call<{ ok: boolean }>('delete', `campaigns/${campaign.id}`, {
      method: 'DELETE',
    });

    if (result) {
      startRouteProgress();
      router.replace('/newsletter');
      router.refresh();
    }
  }

  const pending = busy !== null;

  return (
    <div className="flex flex-col gap-4">
      {scheduled && campaign.scheduledAt ? (
        <Alert
          tone="warning"
          title={`Programmée le ${formatDateShort(new Date(campaign.scheduledAt))} à ${formatTimeCompact(new Date(campaign.scheduledAt))}`}
          action={
            <Button
              type="button"
              variant="secondary"
              size="compact"
              loading={busy === 'cancel'}
              loadingLabel="Un instant…"
              disabled={pending}
              onClick={() => void unschedule()}
            >
              Déprogrammer
            </Button>
          }
        >
          Elle partira seule à cette heure. Tu peux encore la modifier ; déprogrammée, elle
          redevient un brouillon.
        </Alert>
      ) : null}

      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
        <h2 className="text-h3 font-bold">Contenu</h2>

        <Field
          label="Objet"
          htmlFor="subject"
          help="Ce qu’on lit dans la boîte de réception. Court, concret : « 5 sorties ce week-end à Cotonou »."
        >
          <Input
            id="subject"
            value={draft.subject}
            maxLength={150}
            onChange={(event) => set('subject', event.target.value)}
            disabled={pending}
          />
        </Field>

        <Field
          label="Texte d’aperçu"
          hint="· facultatif"
          htmlFor="preheader"
          help="Affiché après l’objet, dans la liste des messages."
        >
          <Input
            id="preheader"
            value={draft.preheader}
            maxLength={150}
            onChange={(event) => set('preheader', event.target.value)}
            disabled={pending}
          />
        </Field>

        <Field label="Titre" hint="· facultatif" htmlFor="heading">
          <Input
            id="heading"
            value={draft.heading}
            maxLength={120}
            onChange={(event) => set('heading', event.target.value)}
            disabled={pending}
          />
        </Field>

        <Field
          label="Texte"
          htmlFor="body"
          help="Texte simple : une ligne vide sépare deux paragraphes, les adresses https:// deviennent des liens."
        >
          <Textarea
            id="body"
            rows={9}
            value={draft.body}
            maxLength={10_000}
            onChange={(event) => set('body', event.target.value)}
            disabled={pending}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
          <Field label="Bouton" hint="· facultatif" htmlFor="ctaLabel">
            <Input
              id="ctaLabel"
              value={draft.ctaLabel}
              maxLength={40}
              placeholder="Voir tous les événements"
              onChange={(event) => set('ctaLabel', event.target.value)}
              disabled={pending}
            />
          </Field>
          <Field
            label="Lien du bouton"
            htmlFor="ctaUrl"
            help="Une page du site (/evenements) ou https://…"
          >
            <Input
              id="ctaUrl"
              value={draft.ctaUrl}
              maxLength={500}
              placeholder="/evenements"
              onChange={(event) => set('ctaUrl', event.target.value)}
              disabled={pending}
            />
          </Field>
        </div>
      </Surface>

      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold">Événements mis en avant</h2>
        <EventPicker
          value={draft.events}
          onChange={(events) => set('events', events)}
          disabled={pending}
        />
      </Surface>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          loading={busy === 'save'}
          loadingLabel="Enregistrement…"
          disabled={pending || !dirty}
          onClick={() => void save()}
        >
          <Save className="size-4" aria-hidden />
          Enregistrer
        </Button>
        <Button
          type="button"
          variant="tertiary"
          loading={busy === 'duplicate'}
          loadingLabel="Copie…"
          disabled={pending}
          onClick={() => void duplicate()}
        >
          <Copy className="size-4" aria-hidden />
          Dupliquer
        </Button>
        {campaign.status === 'DRAFT' ? (
          confirmDelete ? (
            <>
              <Button
                type="button"
                variant="destructive"
                loading={busy === 'delete'}
                loadingLabel="Suppression…"
                disabled={pending}
                onClick={() => void remove()}
              >
                Confirmer la suppression
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="tertiary"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              Supprimer le brouillon
            </Button>
          )
        ) : null}
        {dirty ? (
          <span className="text-micro text-amber-700">Modifications non enregistrées</span>
        ) : null}
      </div>

      {notice ? <Alert tone="info" title={notice} /> : null}
      {error ? (
        <Alert tone="danger" title="Impossible pour l’instant">
          {error}
        </Alert>
      ) : null}

      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold">Tester</h2>
        <p className="text-body-s text-text-2">
          L’e-mail exact, marqué « [Test] », envoyé à une seule adresse. Elle n’est pas abonnée pour
          autant.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendTest();
          }}
        >
          <Input
            type="email"
            required
            value={testEmail}
            onChange={(event) => setTestEmail(event.target.value)}
            placeholder="ton.adresse@exemple.com"
            aria-label="Adresse de test"
            className="min-w-[220px] flex-1"
            disabled={pending}
          />
          <Button
            type="submit"
            variant="secondary"
            loading={busy === 'test'}
            loadingLabel="Envoi…"
            disabled={pending || dirty}
          >
            Envoyer un test
          </Button>
        </form>
        {dirty ? (
          <p className="text-micro text-text-3">
            Enregistre d’abord : le test part de la version enregistrée.
          </p>
        ) : null}
      </Surface>

      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold">Envoyer</h2>
        <p className="text-body-s text-text-2">
          {audience === 0
            ? 'Aucun abonné n’a encore confirmé son adresse : il n’y a personne à qui envoyer.'
            : `${audience.toLocaleString('fr-FR')} abonné${audience > 1 ? 's' : ''} actif${audience > 1 ? 's' : ''} la recevront. Les adresses non confirmées ne reçoivent rien.`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {confirmSend ? (
            <>
              <Button
                type="button"
                variant="ink"
                loading={busy === 'send'}
                loadingLabel="Lancement…"
                disabled={pending}
                onClick={() => void send()}
              >
                <Send className="size-4" aria-hidden />
                Confirmer l’envoi à {audience.toLocaleString('fr-FR')} adresse
                {audience > 1 ? 's' : ''}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setConfirmSend(false)}>
                Annuler
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ink"
              disabled={pending || dirty || audience === 0}
              onClick={() => setConfirmSend(true)}
            >
              <Send className="size-4" aria-hidden />
              Envoyer maintenant
            </Button>
          )}
        </div>

        <form
          className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (scheduleAt) void send(new Date(scheduleAt).toISOString());
          }}
        >
          <Field label="Ou programmer pour" htmlFor="scheduleAt" className="min-w-[220px]">
            <Input
              id="scheduleAt"
              type="datetime-local"
              value={scheduleAt}
              onChange={(event) => setScheduleAt(event.target.value)}
              disabled={pending}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || dirty || !scheduleAt || audience === 0}
          >
            <CalendarClock className="size-4" aria-hidden />
            {scheduled ? 'Reprogrammer' : 'Programmer'}
          </Button>
        </form>
        {dirty ? (
          <p className="text-micro text-text-3">
            Enregistre d’abord : l’envoi part de la version enregistrée.
          </p>
        ) : null}
      </Surface>
    </div>
  );
}
