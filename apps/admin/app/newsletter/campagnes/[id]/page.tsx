import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  NEWSLETTER_CAMPAIGN_STATUS_LABELS,
  type NewsletterCampaignDetail,
  type NewsletterPreview,
} from '@nexakabi/contracts';
import { Alert, Badge } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied, ReadOnlyNotice } from '../../../access';
import { AdminShell } from '../../../shell';
import { NewsletterNav } from '../../newsletter-nav';
import { CampaignEditor } from './campaign-editor';
import { CampaignResults } from './campaign-results';
import { EmailPreview } from './email-preview';

export const metadata: Metadata = { title: 'Campagne' };

/**
 * Une campagne : à gauche ce qu'on fait (rédiger, tester, envoyer — ou suivre
 * l'envoi), à droite l'e-mail tel qu'il part.
 */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'newsletter')) return <AccessDenied user={user} space="newsletter" />;
  const canAct = hasAdminAccess(user, 'newsletter', 'act');

  const { id } = await params;
  const [detail, preview] = await Promise.all([
    adminFetch<NewsletterCampaignDetail>(`/newsletter/campaigns/${encodeURIComponent(id)}`),
    adminFetch<NewsletterPreview>(`/newsletter/campaigns/${encodeURIComponent(id)}/preview`),
  ]);

  if (!detail.ok) {
    return (
      <AdminShell user={user}>
        <div className="flex flex-col gap-4">
          <NewsletterNav />
          <Alert tone="danger" title="Campagne indisponible">
            {detail.message}
          </Alert>
          <Link href="/newsletter" className="text-body-s font-semibold">
            ← Toutes les campagnes
          </Link>
        </div>
      </AdminShell>
    );
  }

  const campaign = detail.data;
  const editable = campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED';

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <NewsletterNav />

        <header className="flex flex-col gap-2">
          <Link href="/newsletter" className="text-body-s font-semibold text-text-2">
            ← Toutes les campagnes
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">
              {campaign.subject}
            </h1>
            <Badge tone={campaign.status === 'SENT' ? 'success' : 'neutral'}>
              {NEWSLETTER_CAMPAIGN_STATUS_LABELS[campaign.status]}
            </Badge>
          </div>
          <p className="text-micro text-text-3">Rédigée par {campaign.createdByName}</p>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
          <div className="flex min-w-0 flex-col gap-4">
            {editable ? (
              canAct ? (
                <CampaignEditor
                  campaign={campaign}
                  audience={preview.ok ? preview.data.audience : 0}
                />
              ) : (
                <ReadOnlyNotice what="rédiger ou envoyer une campagne" />
              )
            ) : (
              <CampaignResults campaign={campaign} canAct={canAct} />
            )}
          </div>

          <div className="min-w-0 xl:sticky xl:top-24">
            {preview.ok ? (
              <EmailPreview preview={preview.data} />
            ) : (
              <Alert tone="warning" title="Aperçu indisponible">
                {preview.message}
              </Alert>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
