import { BrandMark, RowSkeleton, Skeleton } from '@nexakabi/ui';

/**
 * La console, pendant qu'une page arrive.
 *
 * ── Pourquoi ce composant redessine l'en-tête ────────────────────────────
 * Parce qu'ici le cadre n'est pas dans le layout : chaque page monte son
 * propre `AdminShell`, après avoir vérifié la session et, le cas échéant,
 * redirigé. Un état de chargement remplace donc TOUT, en-tête compris — et un
 * en-tête qui disparaît une seconde à chaque clic donne l'impression d'une
 * console qui se relance sans arrêt.
 *
 * On redessine donc la barre du haut à sa géométrie exacte : 58 px, même
 * gouttière, même largeur maximale, la marque au même endroit. Ce qu'on ne
 * peut pas connaître avant la session — le nom de l'employé, ses espaces —
 * reste en gris. Rien ne bouge à l'arrivée.
 */
export function ConsoleSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex h-[58px] max-w-[1180px] items-center gap-3 px-4 sm:gap-4 sm:px-5">
          {/* Même marque, même taille que `ConsoleShell` : rien ne bouge à l'arrivée. */}
          <span className="flex min-w-0 shrink items-center gap-1 text-text-strong">
            <BrandMark size={34} />
            <span className="truncate font-display text-[16px] font-bold tracking-[-0.02em]">
              Administration
            </span>
          </span>

          <div className="flex-1" />

          <div className="hidden items-center gap-3 md:flex">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-[11px] w-[150px]" index={1} />
          </div>
          <Skeleton className="size-9 rounded-field md:hidden" />
        </div>

        {/* Le bandeau des espaces : sa hauteur est celle d'une zone tactile. */}
        <div className="mx-auto hidden max-w-[1180px] gap-4 px-5 md:flex">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton
              key={index}
              index={index}
              className="my-[13px] h-[18px] w-[82px] shrink-0"
            />
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-16 pt-5 sm:px-5 sm:pt-6">
        {children ?? <ConsoleListSkeleton />}
      </main>
    </div>
  );
}

/** Titre, quatre chiffres, puis une liste : la forme de presque tous les écrans. */
export function ConsoleListSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[28px] w-[210px]" />
        <Skeleton className="h-[11px] w-[320px] max-w-full" index={1} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-card border border-border-subtle p-4"
          >
            <Skeleton className="h-[9px] w-[65%]" index={index} />
            <Skeleton className="h-[22px] w-[50%]" index={index + 1} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }, (_, index) => (
          <RowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
