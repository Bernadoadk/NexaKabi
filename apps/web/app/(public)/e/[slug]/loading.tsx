import { Skeleton } from '@nexakabi/ui';

/**
 * La page événement, pendant qu'elle arrive.
 *
 * C'est « la page la plus importante du produit » : celle qui reçoit le trafic
 * WhatsApp, souvent sur un téléphone d'entrée de gamme et un réseau qui hésite.
 * Un visiteur qui ne voit rien pendant deux secondes referme l'onglet, et
 * l'organisateur ne saura jamais pourquoi sa campagne n'a rien donné.
 *
 * La bannière, le titre, les trois lignes d'informations pratiques et le bloc
 * d'achat sont donc dessinés tout de suite, à leur taille finale.
 */
export default function EventLoading() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-5">
      <Skeleton className="aspect-[16/9] w-full rounded-card sm:aspect-[21/9]" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[11px] w-[120px]" />
          <Skeleton className="h-[34px] w-[80%]" index={1} />
          <Skeleton className="h-[34px] w-[45%]" index={2} />

          <div className="mt-2 flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-field" index={index} />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-[11px] w-[30%]" index={index} />
                  <Skeleton className="h-[13px] w-[55%]" index={index + 1} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <Skeleton className="h-[11px] w-full" index={1} />
            <Skeleton className="h-[11px] w-full" index={2} />
            <Skeleton className="h-[11px] w-[70%]" index={3} />
          </div>
        </div>

        {/* Le bloc d'achat : c'est lui qu'on attend vraiment. */}
        <div className="flex flex-col gap-3 rounded-card border border-border-subtle p-4">
          <Skeleton className="h-[13px] w-[40%]" />
          <Skeleton className="h-[26px] w-[55%]" index={1} />
          <Skeleton className="h-[var(--tap-primary)] w-full rounded-button" index={2} />
          <Skeleton className="h-[9px] w-[75%]" index={3} />
        </div>
      </div>
    </div>
  );
}
