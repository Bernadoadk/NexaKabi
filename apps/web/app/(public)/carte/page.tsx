import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { EventMapPin } from '@nexakabi/contracts';
import { apiFetch } from '@/lib/api';
import { EventsMap } from './events-map';

export const metadata: Metadata = {
  title: 'Carte des événements',
  description: 'Les événements à venir au Bénin, autour de toi ou dans tout le pays.',
};

/**
 * Carte des événements (écran P6).
 *
 * ── Ce que la page fait côté serveur, et pourquoi si peu ───────────────────
 * Elle charge les épingles — tous les événements à venir qui ont des
 * coordonnées — et transmet la clé navigateur de Google Maps. Tout le reste
 * est affaire de navigateur : la carte, la position du participant s'il
 * l'accorde, la proximité. Rien de cela n'a de sens sans écran ni GPS.
 *
 * La clé est PUBLIQUE par nature : le SDK en a besoin dans la page. Ce qui la
 * protège, c'est la restriction par domaine posée dans Google Cloud, pas le
 * secret.
 */
export default async function MapPage() {
  const [pinsResult, headerStore] = await Promise.all([
    apiFetch<EventMapPin[]>('/events/map', { revalidate: 60 }),
    headers(),
  ]);

  const pins = pinsResult.ok ? pinsResult.data : [];
  const nonce = headerStore.get('x-nonce') ?? undefined;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? '';

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-5 sm:py-6">
      <header className="flex flex-col gap-1">
        <p className="eyebrow text-text-3">Autour de toi</p>
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Carte des événements</h1>
        <p className="max-w-[60ch] text-body text-text-2">
          {pins.length === 0
            ? 'Aucun événement localisé pour l’instant. Ils apparaîtront ici dès qu’un organisateur en publiera un avec son lieu.'
            : `${pins.length} événement${pins.length > 1 ? 's' : ''} à venir. Survole ou touche une épingle pour voir la fiche, active ta position pour trier du plus proche au plus loin.`}
        </p>
      </header>

      <EventsMap pins={pins} apiKey={apiKey} nonce={nonce} />
    </main>
  );
}
