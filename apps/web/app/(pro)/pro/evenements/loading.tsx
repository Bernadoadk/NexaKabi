import { EventCardSkeleton, Skeleton } from '@nexakabi/ui';

/**
 * « Mes événements », pendant que la liste arrive.
 *
 * Même grille que l'écran final — image, date, lieu, puis la rangée de gestes
 * (aperçu, modifier, publier, supprimer). Le rectangle du bas compte : sans
 * lui, les cartes grandiraient à l'arrivée des données et le bouton qu'on
 * s'apprêtait à toucher se déroberait sous le doigt.
 */
export default function OrganizerEventsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[11px] w-[90px]" />
          <Skeleton className="h-[28px] w-[220px]" index={1} />
        </div>
        <Skeleton className="h-[var(--tap-min)] w-[168px] rounded-button" index={2} />
      </div>

      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} index={index} className="h-9 w-[104px] shrink-0 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <EventCardSkeleton />
            <Skeleton className="h-[var(--tap-min)] w-full rounded-field" index={index} />
          </div>
        ))}
      </div>
    </div>
  );
}
