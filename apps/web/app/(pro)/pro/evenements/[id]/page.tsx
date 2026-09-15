import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { EventDetail } from '@nexakabi/contracts';
import { getCurrentUser } from '@/lib/session';
import { orgFetch, resolveActiveOrganization } from '@/lib/organizations';
import { fetchCategories, fetchCities } from '@/lib/events';
import { EventWizard } from './wizard';

export const metadata: Metadata = { title: 'Modifier un événement' };

/**
 * Assistant de création et de gestion d'un événement (écran O3).
 *
 * Le fil d'Ariane, le badge d'état et les onglets vivent dans `layout.tsx` :
 * ils sont communs aux quatre écrans de l'événement.
 */
export default async function EventWizardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?suite=/pro/evenements/${id}`);

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const [result, categories, cities, readinessResult, headerStore] = await Promise.all([
    orgFetch<EventDetail>(active.id, `/organizer/events/${id}`),
    fetchCategories(),
    fetchCities(),
    orgFetch<{ missing: string[] }>(active.id, `/organizer/events/${id}/readiness`),
    headers(),
  ]);

  if (!result.ok) notFound();

  return (
    <EventWizard
      organizationId={active.id}
      event={result.data}
      categories={categories}
      cities={cities}
      initialMissing={readinessResult.ok ? readinessResult.data.missing : null}
      // La clé navigateur est publique par construction (voir `.env.example`) ;
      // le nonce autorise la balise du SDK sous la politique de sécurité.
      maps={{
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? '',
        nonce: headerStore.get('x-nonce') ?? undefined,
      }}
    />
  );
}
