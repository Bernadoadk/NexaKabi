import { Spinner, cn } from '@nexakabi/ui';

/**
 * Le scanner, pendant que sa coque se charge.
 *
 * ── Pourquoi un cadre de visée et pas un squelette ────────────────────────
 * Cet écran n'affiche aucune donnée : il affiche une CAMÉRA. Il n'y a donc
 * rien à griser — mais il y a une chose à faire, et le contrôleur peut la
 * commencer avant que le code soit là : lever son téléphone et viser. Le cadre
 * est dessiné pour de vrai, les barres du haut et du bas aussi ; seuls les
 * compteurs, qui dépendent du carnet local, restent absents.
 *
 * C'est aussi l'écran du produit qui a le plus de raisons d'attendre : il vit
 * dans un route group à part, avec son propre service worker, et sa coque
 * s'installe au premier passage — souvent dans une salle sans réseau.
 */
export default function ScannerLoading() {
  return (
    <main className="relative min-h-dvh bg-ink">
      {/* Le cadre de visée, aux dimensions exactes de celui du scanner. Pas de
          ligne de balayage : elle promettrait une lecture qui ne peut pas
          encore avoir lieu. */}
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <div className="relative size-[62vw] max-w-[280px] opacity-40">
          <Corner className="left-0 top-0 border-l-4 border-t-4" />
          <Corner className="right-0 top-0 border-r-4 border-t-4" />
          <Corner className="bottom-0 left-0 border-b-4 border-l-4" />
          <Corner className="bottom-0 right-0 border-b-4 border-r-4" />
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <span className="rounded-chip bg-ink/70 px-3 py-2 text-body-s font-semibold text-white/60">
          ← Événements
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 bg-gradient-to-t from-ink to-transparent p-4 pt-10">
        <span className="flex items-center gap-2.5 text-body-s font-semibold text-white/70">
          <Spinner size={15} tone="on-ink" />
          Préparation de la caméra…
        </span>

        <div className="flex w-full gap-2">
          {['Recherche', 'Historique'].map((label) => (
            <span
              key={label}
              className="grid min-h-[var(--tap-primary)] flex-1 place-items-center rounded-button bg-white/[0.07] font-bold text-white/40"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={cn('absolute size-8 border-white/90', className)} />;
}
