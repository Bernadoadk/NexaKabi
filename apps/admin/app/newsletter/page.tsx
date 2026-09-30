import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Mail } from 'lucide-react';
import {
  NEWSLETTER_CAMPAIGN_STATUS_LABELS,
  type NewsletterCampaignStatus,
  type NewsletterCampaignSummary,
  type NewsletterOverview,
} from '@nexakabi/contracts';
import { formatDateShort, formatTimeCompact } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, StatGrid, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../access';
import { AdminShell } from '../shell';
import { NewCampaignButton } from './new-campaign-button';
import { NewsletterNav } from './newsletter-nav';
import { SettingsCard } from './settings-card';

export const metadata: Metadata = { title: 'Newsletter' };

/**
 * Espace Newsletter — vue d'ensemble.
 *
 * ── Ce qu'on y décide ─────────────────────────────────────────────────────
 * Trois choses, dans cet ordre : à qui on peut écrire (les abonnés qui ont
 * CONFIRMÉ leur adresse — les autres ne reçoivent rien), ce qu'on leur écrit
 * (les campagnes), et ce que la plateforme accepte d'envoyer aux participants
 * au-delà de la newsletter (sélections hebdomadaires, WhatsApp).
 */
export default async function NewsletterPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'newsletter')) return <AccessDenied user={user} space="newsletter" />;
  const canAct = hasAdminAccess(user, 'newsletter', 'act');

  const result = await adminFetch<NewsletterOverview>('/newsletter');

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <NewsletterNav />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Newsletter</h1>
            <p className="text-body-s text-text-2">
              Un e-mail composé ici, envoyé aux seules adresses qui l’ont demandé et confirmé.
            </p>
          </div>
          {canAct ? <NewCampaignButton /> : null}
        </header>

        {!result.ok ? (
          <Alert tone="danger" title="Espace indisponible">
            {result.message}
          </Alert>
        ) : (
          <Overview data={result.data} canAct={canAct} />
        )}
      </div>
    </AdminShell>
  );
}

function Overview({ data, canAct }: { data: NewsletterOverview; canAct: boolean }) {
  return (
    <>
      {data.emailProvider === 'console' ? (
        <Alert tone="warning" title="Aucun e-mail ne part réellement">
          Le fournisseur d’e-mail est « console » : les envois sont écrits dans les journaux de
          l’API, pas remis. Configure EMAIL_PROVIDER=smtp pour envoyer pour de vrai.
        </Alert>
      ) : null}

      <StatGrid wide={3}>
        <Tile
          href="/newsletter/abonnes?statut=ACTIVE"
          label="Abonnés actifs"
          value={data.subscribers.active}
          hint="Adresses confirmées : les seules à recevoir la newsletter"
          accent
        />
        <Tile
          href="/newsletter/abonnes?statut=PENDING"
          label="À confirmer"
          value={data.subscribers.pending}
          hint="Lien de confirmation envoyé, pas encore ouvert"
        />
        <Tile
          href="/newsletter/abonnes?statut=UNSUBSCRIBED"
          label="Désabonnés"
          value={data.subscribers.unsubscribed}
          hint="Plus rien ne leur est envoyé"
        />
      </StatGrid>

      <section className="flex flex-col gap-3">
        <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">Campagnes</h2>

        {data.campaigns.length === 0 ? (
          <EmptyState
            icon={<Mail size={26} />}
            title="Aucune campagne pour l’instant"
            description={
              canAct
                ? 'Crée une première campagne : un objet, quelques lignes, les événements à mettre en avant.'
                : 'Les campagnes rédigées par l’équipe apparaîtront ici.'
            }
          />
        ) : (
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <ul>
              {data.campaigns.map((campaign) => (
                <li key={campaign.id}>
                  <CampaignRow campaign={campaign} />
                </li>
              ))}
            </ul>
          </Surface>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <SettingsCard initial={data.settings} canAct={canAct} />

        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
          <h2 className="text-h3 font-bold">Côté participants</h2>
          <dl className="flex flex-col gap-2 text-body-s">
            <Line
              label="Ont demandé la sélection selon leurs goûts"
              value={data.recommendationSubscribers}
            />
            <Line
              label="Sélections envoyées ces 7 derniers jours"
              value={data.recommendationsLast7Days}
            />
            <Line label="Suivent au moins un organisateur" value={data.followers} />
          </dl>
          <p className="text-micro text-text-3">
            Chaque participant choisit lui-même ce qu’il reçoit et par où, depuis ses alertes.
          </p>
        </Surface>
      </section>
    </>
  );
}

function CampaignRow({ campaign }: { campaign: NewsletterCampaignSummary }) {
  return (
    <Link
      href={`/newsletter/campagnes/${campaign.id}`}
      className="flex flex-wrap items-center gap-3 border-t border-border-subtle p-4 text-text-strong transition first:border-t-0 hover:bg-surface-alt"
    >
      <div className="min-w-[220px] flex-1">
        <div className="text-body font-bold">{campaign.subject}</div>
        <div className="text-micro text-text-3">{describeTiming(campaign)}</div>
      </div>

      {campaign.status === 'SENT' || campaign.status === 'SENDING' ? (
        <span className="text-body-s tabular-nums text-text-2">
          {campaign.sentCount} / {campaign.recipientCount} envoyés
          {campaign.failedCount > 0 ? ` · ${campaign.failedCount} échec(s)` : ''}
        </span>
      ) : null}

      <Badge tone={STATUS_TONES[campaign.status]}>
        {NEWSLETTER_CAMPAIGN_STATUS_LABELS[campaign.status]}
      </Badge>
    </Link>
  );
}

const STATUS_TONES: Readonly<
  Record<NewsletterCampaignStatus, 'neutral' | 'warning' | 'info' | 'success' | 'danger'>
> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warning',
  SENDING: 'info',
  SENT: 'success',
  CANCELLED: 'danger',
};

function describeTiming(campaign: NewsletterCampaignSummary): string {
  const at = (iso: string) =>
    `${formatDateShort(new Date(iso))} à ${formatTimeCompact(new Date(iso))}`;

  switch (campaign.status) {
    case 'SCHEDULED':
      return campaign.scheduledAt ? `Programmée le ${at(campaign.scheduledAt)}` : 'Programmée';
    case 'SENDING':
      return campaign.startedAt ? `Envoi commencé le ${at(campaign.startedAt)}` : 'Envoi en cours';
    case 'SENT':
      return campaign.completedAt ? `Envoyée le ${at(campaign.completedAt)}` : 'Envoyée';
    case 'CANCELLED':
      return campaign.cancelledAt ? `Arrêtée le ${at(campaign.cancelledAt)}` : 'Arrêtée';
    default:
      return `Brouillon de ${campaign.createdByName} · modifié le ${at(campaign.updatedAt)}`;
  }
}

function Tile({
  href,
  label,
  value,
  hint,
  accent = false,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Surface variant="panel" padding="none" className="min-w-0">
      <Link
        href={href}
        className="flex h-full flex-col gap-0.5 p-3.5 text-text-strong transition hover:bg-surface-alt sm:gap-1 sm:p-5"
      >
        <span className="text-body-s font-semibold text-text-2">{label}</span>
        <span
          className={
            accent && value > 0
              ? 'font-display text-[28px] font-bold leading-none tabular-nums text-coral sm:text-[34px]'
              : 'font-display text-[28px] font-bold leading-none tabular-nums text-text-strong sm:text-[34px]'
          }
        >
          {value.toLocaleString('fr-FR')}
        </span>
        <span className="text-micro text-text-3">{hint}</span>
      </Link>
    </Surface>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle pb-2 last:border-0">
      <dt className="text-text-2">{label}</dt>
      <dd className="font-bold tabular-nums">{value.toLocaleString('fr-FR')}</dd>
    </div>
  );
}
