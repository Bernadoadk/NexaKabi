import { Skeleton } from '@nexakabi/ui';

/**
 * Gabarit d'attente des deux écrans de secours du scanner.
 *
 * Recherche manuelle et historique ont la même armature : le retour au
 * scanner, un titre, une ligne d'explication, puis une liste. Seul le bloc du
 * milieu diffère — un champ de recherche d'un côté, rien de l'autre.
 *
 * ── Pourquoi ces écrans méritent un squelette ─────────────────────────────
 * On ne les ouvre jamais par curiosité. On les ouvre quand la caméra vient
 * d'échouer, avec quelqu'un qui attend devant soi. Sans ce fichier, c'est le
 * cadre de visée du scanner qui s'afficherait à leur place, hérité du segment
 * parent : exactement l'écran que le contrôleur vient de quitter parce qu'il
 * ne marchait pas.
 */
export function ScanPanelLoading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-5 px-5 py-6">
      {/* Le retour au scanner est écrit en dur : c'est la sortie de secours de
          la sortie de secours, elle ne doit jamais être en attente. */}
      <header className="flex items-center justify-between gap-3">
        <span className="text-body-s font-semibold text-white/70">← Scanner</span>
      </header>

      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-h2 font-bold tracking-[-0.02em]">{title}</h1>
        <Skeleton className="h-[11px] w-[70%] bg-white/10" />
      </div>

      {children}

      <ul className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-3 rounded-card bg-white/[0.07] px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-[13px] w-[55%] bg-white/10" index={index} />
              <Skeleton className="h-[9px] w-[35%] bg-white/10" index={index + 1} />
            </div>
            <Skeleton
              className="h-[var(--tap-min)] w-[112px] shrink-0 rounded-button bg-white/10"
              index={index}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
