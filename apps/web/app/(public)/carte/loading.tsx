import { MapPin } from 'lucide-react';
import { Skeleton, Spinner } from '@nexakabi/ui';

/**
 * La carte, pendant qu'elle se charge.
 *
 * Seul écran du produit où un point qui tourne est la bonne réponse : une
 * carte n'a pas de géométrie à annoncer — c'est une surface unique, et un
 * grand rectangle gris ressemblerait à une panne plutôt qu'à une attente. On
 * garde en revanche la forme du panneau latéral, qui, lui, est une liste.
 */
export default function MapLoading() {
  return (
    <div className="flex min-h-[70dvh] flex-col gap-4 px-4 py-5 sm:px-5 lg:flex-row">
      <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 rounded-card bg-fill-muted">
        <span className="flex size-[58px] items-center justify-center rounded-full bg-surface text-coral shadow-sm">
          <MapPin size={24} />
        </span>
        <div className="flex items-center gap-2">
          <Spinner size={15} tone="coral" />
          <p className="text-body-s font-semibold text-text-2">Chargement de la carte…</p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2.5 lg:w-[340px]">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-card border border-border-subtle p-3"
          >
            <Skeleton className="size-14 shrink-0 rounded-field" index={index} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-[11px] w-[70%]" index={index} />
              <Skeleton className="h-[9px] w-[45%]" index={index + 1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
