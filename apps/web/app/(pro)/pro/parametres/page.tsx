import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import {
  getOrganization,
  listPayoutAccounts,
  resolveActiveOrganization,
} from '@/lib/organizations';
import { OrganizationSettingsForm } from './organization-settings-form';
import { PayoutAccountsSection } from './payout-accounts-section';

export const metadata: Metadata = { title: 'Paramètres' };

/**
 * Paramètres de l'organisation — écran qui n'existait pas.
 *
 * `finances/page.tsx` renvoyait déjà vers « les paramètres de ton
 * organisation » pour ajouter un compte de retrait, mais aucun écran ne
 * répondait à ce lien. Les deux endpoints qu'il utilise —
 * `PATCH /organizer/organizations/current` et
 * `GET/POST .../payout-accounts` — existaient pourtant déjà côté API :
 * ce chantier est purement une page manquante, pas une fonctionnalité
 * manquante.
 */
export default async function OrganizationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?suite=/pro/parametres');

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const [organization, accounts] = await Promise.all([
    getOrganization(active.id),
    listPayoutAccounts(active.id),
  ]);

  if (!organization) redirect('/pro');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-h1 font-bold">Paramètres</h1>

      <OrganizationSettingsForm organizationId={active.id} organization={organization} />
      <PayoutAccountsSection organizationId={active.id} accounts={accounts} />
    </div>
  );
}
