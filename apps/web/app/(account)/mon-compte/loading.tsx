import { RowSkeleton, Skeleton } from '@nexakabi/ui';

/**
 * Mon compte, pendant que la page arrive.
 *
 * Couvre aussi les billets, les commandes et les notifications : toutes sont
 * des listes de lignes, et `RowSkeleton` en a exactement la géométrie. Le
 * cadre — en-tête, onglets du compte — vient du layout et reste affiché.
 */
export default function AccountLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[24px] w-[190px]" />

      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }, (_, index) => (
          <RowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
