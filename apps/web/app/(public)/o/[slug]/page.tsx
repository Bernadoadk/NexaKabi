import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { Badge, EventCardStandard, Surface } from '@nexakabi/ui';
import { fetchOrganizerPage } from '@/lib/events';
import { toCard } from '../../page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchOrganizerPage(slug);

  if (!page) return { title: 'Organisateur introuvable' };

  return {
    title: page.organization.name,
    description:
      page.organization.description ?? `Les événements de ${page.organization.name} au Bénin.`,
    openGraph: { title: page.organization.name, type: 'profile' },
  };
}

/** Profil public d'un organisateur (écran P6) — signal de confiance. */
export default async function OrganizerPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await fetchOrganizerPage(slug);

  if (!page) notFound();

  const { organization, upcoming, past } = page;

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-8">
      <Surface variant="panel" padding="comfortable" className="flex flex-wrap items-center gap-4">
        {/* Initiales de MARQUE (2 premiers caractères), pas d'identité
            personnelle : volontairement différent du composant `Avatar`
            partagé, qui découpe par mot pour un nom de personne. */}
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-ink text-[20px] font-bold text-white">
          {organization.name.slice(0, 2).toUpperCase()}
        </span>

        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-h1 font-bold">{organization.name}</h1>
            {organization.verified ? (
              <Badge tone="verified">
                <Check className="size-3" strokeWidth={3} />
                Organisateur vérifié
              </Badge>
            ) : null}
          </div>
          {organization.cityName ? (
            <p className="text-body text-text-2">{organization.cityName}</p>
          ) : null}
          {organization.description ? (
            <p className="max-w-[68ch] text-body text-text-2">{organization.description}</p>
          ) : null}
        </div>
      </Surface>

      {upcoming.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-bold">Événements à venir</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {upcoming.map((event) => (
              <EventCardStandard key={event.id} event={toCard(event)} href={`/e/${event.slug}`} />
            ))}
          </div>
        </section>
      ) : (
        <p className="text-body text-text-2">Aucun événement à venir pour le moment.</p>
      )}

      {past.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-bold">Événements passés</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {past.map((event) => (
              <EventCardStandard key={event.id} event={toCard(event)} href={`/e/${event.slug}`} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
