import { EventCardSkeleton, Skeleton } from '@nexakabi/ui';

/**
 * Découvrir, pendant que les événements arrivent.
 *
 * Le filet en haut de l'écran dit qu'il se passe quelque chose ; ce squelette
 * dit QUOI, et surtout combien de place ça prendra. Douze cartes, la même
 * grille, les mêmes gouttières : rien ne se déplacera à l'arrivée des vraies
 * données. C'est la règle du prototype, et c'est aussi ce qui distingue une
 * attente supportable d'un écran qui saute.
 */
export default function DiscoverLoading() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[11px] w-[110px]" />
        <Skeleton className="h-[30px] w-[260px] max-w-full" index={1} />
      </div>

      {/* Les filtres : une ligne de puces, à la hauteur exacte des vraies. */}
      <div className="mt-5 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} index={index} className="h-9 w-[92px] shrink-0 rounded-full" />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => (
          <EventCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
