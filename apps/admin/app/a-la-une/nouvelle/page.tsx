import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SpotlightAdminOverview } from '@nexakabi/contracts';
import { Alert } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../../access';
import { AdminShell } from '../../shell';
import { SpotlightForm } from '../spotlight-form';

export const metadata: Metadata = { title: 'Nouvelle mise en avant' };

/** Mettre à la une un événement de la plateforme (`?type=evenement`) ou externe (`?type=externe`). */
export default async function NewSpotlightPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'spotlights', 'act')) {
    return <AccessDenied user={user} space="spotlights" />;
  }

  const { type } = await searchParams;
  const kind = type === 'externe' ? 'EXTERNAL' : 'EVENT';
  const overview = await adminFetch<SpotlightAdminOverview>('/spotlights');

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <Link href="/a-la-une" className="text-body-s font-semibold text-text-2">
            ← À la une
          </Link>
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">
            {kind === 'EXTERNAL' ? 'Événement externe à la une' : 'Événement à la une'}
          </h1>
        </header>

        {!overview.ok ? (
          <Alert tone="danger" title="Espace indisponible">
            {overview.message}
          </Alert>
        ) : (
          <SpotlightForm
            kind={kind}
            initial={null}
            countries={overview.data.countries}
            showSponsoredLabel={overview.data.settings.showSponsoredLabel}
            nowIso={new Date().toISOString()}
          />
        )}
      </div>
    </AdminShell>
  );
}
