import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { EventDetail } from '@nexakabi/contracts';
import { getCurrentUser } from '@/lib/session';
import { orgFetch, resolveActiveOrganization } from '@/lib/organizations';
import { EventStatusBadge } from '../event-status-badge';
import { EventTabs } from './event-tabs';

/**
 * Cadre commun aux quatre écrans d'un événement.
 *
 * ── Ce que ce fichier a corrigé ────────────────────────────────────────────
 * Les écrans participants (O6), contrôle (O7) et statistiques (O9) existaient
 * et fonctionnaient, mais rien n'y menait : il fallait connaître l'URL. Un
 * écran inatteignable équivaut à un écran absent.
 *
 * Le fil d'Ariane et les onglets vivent ICI plutôt que répétés dans chaque
 * page, pour deux raisons : les quatre écrans affichaient trois liens « retour »
 * légèrement différents, et un cinquième écran ajouté demain héritera de la
 * navigation au lieu de risquer de l'oublier.
 *
 * ── Le coût, et pourquoi il est acceptable ────────────────────────────────
 * Ce layout récupère l'événement, que les pages récupèrent parfois aussi. Next
 * dédoublonne les requêtes identiques d'un même rendu ; celles-ci diffèrent
 * (l'une lit l'événement, l'autre les participants), donc l'appel est réel. Il
 * porte le titre et l'état de publication — de quoi savoir quels onglets ont un
 * sens — ce qu'aucune page ne peut décider seule.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?suite=/pro/evenements/${id}`);

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const result = await orgFetch<EventDetail>(active.id, `/organizer/events/${id}`);
  if (!result.ok) notFound();

  const event = result.data;
  const published = event.status === 'PUBLISHED' || event.status === 'SOLD_OUT';

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href="/pro/evenements"
          className="inline-flex min-h-[32px] items-center text-body-s font-semibold text-text-2 hover:text-text-strong"
        >
          ← Mes événements
        </Link>
        <span className="hidden text-text-faint sm:inline">/</span>
        {/* Sous `sm`, le titre passe sur sa propre ligne, sous le retour et
            l'état : trois lignes serrées valent mieux qu'un titre tronqué. */}
        <span className="order-last w-full truncate text-body font-semibold sm:order-none sm:w-auto sm:max-w-[40ch]">
          {event.title}
        </span>

        <div className="flex-1" />

        <EventStatusBadge status={event.status} />
        {published ? (
          <Link href={`/e/${event.slug}`} className="text-body-s font-semibold">
            Page publique →
          </Link>
        ) : null}
      </div>

      <EventTabs eventId={id} published={published} />

      {children}
    </div>
  );
}
