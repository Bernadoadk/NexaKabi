import { EventCardSkeleton, Skeleton } from '@nexakabi/ui';

/**
 * Le profil d'un organisateur, pendant qu'il arrive.
 *
 * Cette page est un signal de confiance : on y vient depuis une carte
 * d'événement, pour vérifier à qui l'on s'apprête à donner de l'argent. Le
 * bandeau d'identité — pastille, nom, pastille « vérifié » — est donc dessiné
 * en premier et à sa taille exacte, puis les deux grilles d'événements.
 */
export default function OrganizerLoading() {
  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-8">
      <div className="flex flex-wrap items-center gap-4 rounded-panel border border-border bg-surface p-6">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="flex min-w-[240px] flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <Skeleton className="h-[30px] w-[240px] max-w-full" index={1} />
            <Skeleton className="h-[22px] w-[150px] rounded-full" index={2} />
          </div>
          <Skeleton className="h-[13px] w-[120px]" index={3} />
          <Skeleton className="h-[11px] w-full max-w-[520px]" index={4} />
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-h2 font-bold">Événements à venir</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <EventCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
