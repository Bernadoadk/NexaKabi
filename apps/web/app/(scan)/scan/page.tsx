import type { Metadata } from 'next';
import type { AssignedEvent } from '@nexakabi/contracts';
import { formatEventCaptionWithTime, formatTimeSpaced } from '@nexakabi/utils';
import { apiFetchAuthenticated } from '@/lib/session';
import { ManifestStatus } from './manifest-status';

export const metadata: Metadata = {
  title: 'Contrôle à l’entrée',
  robots: { index: false, follow: false },
};

/**
 * Écran C1 — événements assignés.
 *
 * Le contrôleur ouvre cet écran une fois, à son arrivée, souvent avec du réseau
 * encore disponible. C'est donc le bon moment pour télécharger le carnet — et
 * le seul écran où l'on peut se permettre d'attendre une requête.
 */
export default async function ScannerHomePage() {
  const result = await apiFetchAuthenticated<AssignedEvent[]>('/checkin/events');
  const events = result.ok ? result.data : [];

  const open = events.filter((event) => event.isOpen);
  const upcoming = events.filter((event) => !event.isOpen);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        <p className="eyebrow text-white/50">Nexa-Kabi · Contrôle</p>
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Mes événements</h1>
      </header>

      {events.length === 0 ? (
        <div className="rounded-panel border border-white/12 p-6 text-center">
          <p className="text-body font-semibold">Aucun événement assigné</p>
          <p className="mt-1.5 text-body-s text-white/60">
            L’organisateur doit t’ajouter comme contrôleur sur un événement. Le lien qu’il t’enverra
            ouvrira directement cette page.
          </p>
        </div>
      ) : null}

      {open.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-body-s font-bold uppercase tracking-wide text-white/50">
            Prêt à scanner
          </h2>
          {open.map((event) => (
            <OpenEventCard key={event.eventId} event={event} />
          ))}
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-body-s font-bold uppercase tracking-wide text-white/50">Plus tard</h2>
          {upcoming.map((event) => (
            <ClosedEventCard key={event.eventId} event={event} />
          ))}
        </section>
      ) : null}
    </main>
  );
}

/**
 * Événement ouvert au scan.
 *
 * Un seul bouton, en pleine largeur, à 52 px : le contrôleur le trouve sans
 * regarder. Tout le reste de la carte est informatif.
 */
function OpenEventCard({ event }: { event: AssignedEvent }) {
  return (
    <article className="flex flex-col gap-4 rounded-panel bg-white/[0.07] p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-h3 font-bold leading-tight">{event.title}</h3>
        <p className="text-body-s text-white/60">
          {formatEventCaptionWithTime(new Date(event.startsAt))}
          {event.venueName ? ` · ${event.venueName}` : ''}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Attendus" value={String(event.expectedCount)} />
        <Stat label="Entrés" value={String(event.checkedInCount)} />
        <Stat label="Porte" value={event.gate ?? 'Toutes'} />
      </dl>

      {/* Le téléchargement du carnet se fait ici, pendant qu'il y a du réseau :
          c'est ce qui rend le scanner utilisable une fois dans la salle. */}
      <ManifestStatus eventId={event.eventId} eventTitle={event.title} />
    </article>
  );
}

function ClosedEventCard({ event }: { event: AssignedEvent }) {
  const opensAt = new Date(new Date(event.startsAt).getTime() - 3_600_000);

  return (
    <article className="flex flex-col gap-1 rounded-panel border border-white/10 p-5 opacity-60">
      <h3 className="text-body font-bold">{event.title}</h3>
      <p className="text-body-s text-white/50">
        {formatEventCaptionWithTime(new Date(event.startsAt))}
      </p>
      {/* Dire QUAND plutôt que « indisponible » : le contrôleur sait s'il doit
          attendre ou prévenir l'organisateur. */}
      <p className="mt-1 text-micro text-white/40">
        Le scanner s’ouvrira à {formatTimeSpaced(opensAt)}
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-micro text-white/40">{label}</dt>
      <dd className="tabular text-body font-bold">{value}</dd>
    </div>
  );
}

export const dynamic = 'force-dynamic';
