import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SpotlightAdmin, SpotlightAdminOverview } from '@nexakabi/contracts';
import { Alert } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../../access';
import { AdminShell } from '../../shell';
import { SpotlightForm } from '../spotlight-form';

export const metadata: Metadata = { title: 'Modifier une mise en avant' };

export default async function EditSpotlightPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'spotlights', 'act')) {
    return <AccessDenied user={user} space="spotlights" />;
  }

  const { id } = await params;
  const [spotlight, overview] = await Promise.all([
    adminFetch<SpotlightAdmin>(`/spotlights/${encodeURIComponent(id)}`),
    adminFetch<SpotlightAdminOverview>('/spotlights'),
  ]);

  const editable =
    spotlight.ok && (spotlight.data.phase === 'LIVE' || spotlight.data.phase === 'SCHEDULED');

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <Link href="/a-la-une" className="text-body-s font-semibold text-text-2">
            ← À la une
          </Link>
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">
            {spotlight.ok ? spotlight.data.title : 'Mise en avant'}
          </h1>
        </header>

        {!spotlight.ok || !overview.ok ? (
          <Alert tone="danger" title="Mise en avant introuvable">
            {!spotlight.ok ? spotlight.message : !overview.ok ? overview.message : null}
          </Alert>
        ) : !editable ? (
          <Alert tone="info" title="Cette mise en avant est terminée">
            Une mise en avant terminée ou retirée ne se modifie plus : son bilan reste tel quel.
            Crée-en une nouvelle depuis la liste.
          </Alert>
        ) : (
          <SpotlightForm
            kind={spotlight.data.kind}
            initial={spotlight.data}
            countries={overview.data.countries}
            showSponsoredLabel={overview.data.settings.showSponsoredLabel}
            nowIso={new Date().toISOString()}
          />
        )}
      </div>
    </AdminShell>
  );
}
