import { Skeleton } from '@nexakabi/ui';

/**
 * La liste des événements du contrôleur, pendant qu'elle arrive.
 *
 * ── Pourquoi les barres sont blanches et non grises ───────────────────────
 * Tout l'espace de contrôle est sur fond encre. Le gris du système
 * (`bg-fill-muted`) y est presque invisible : le squelette ne se verrait pas,
 * et l'écran passerait pour vide. `bg-white/10` donne le même effet de relief
 * qu'un gris clair sur fond papier.
 *
 * ── Ce qui est écrit en dur ───────────────────────────────────────────────
 * Le surtitre et « Mes événements » : ils ne dépendent d'aucune requête. Le
 * contrôleur arrive souvent dans le noir, à la porte, en retard — savoir tout
 * de suite qu'il est sur le bon écran vaut mieux que deux lignes grises de
 * plus.
 */
export default function ScannerHomeLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        <p className="eyebrow text-white/50">Nexa-Kabi · Contrôle</p>
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Mes événements</h1>
      </header>

      <section className="flex flex-col gap-3">
        <Skeleton className="h-[11px] w-[120px] bg-white/10" />

        {/* Une carte d'événement ouvert : titre, date, trois compteurs, et le
            bouton de téléchargement du carnet à 52 px — celui que le
            contrôleur cherche du pouce sans regarder. */}
        <article className="flex flex-col gap-4 rounded-panel bg-white/[0.07] p-5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[19px] w-[75%] bg-white/10" />
            <Skeleton className="h-[11px] w-[55%] bg-white/10" index={1} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Skeleton className="h-[9px] w-[70%] bg-white/10" index={index} />
                <Skeleton className="h-[15px] w-[50%] bg-white/10" index={index + 1} />
              </div>
            ))}
          </div>

          <Skeleton className="h-[var(--tap-primary)] w-full rounded-button bg-white/10" index={2} />
        </article>
      </section>

      <section className="flex flex-col gap-3">
        <Skeleton className="h-[11px] w-[90px] bg-white/10" />
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5 rounded-panel border border-white/10 p-5">
            <Skeleton className="h-[13px] w-[65%] bg-white/10" index={index} />
            <Skeleton className="h-[11px] w-[45%] bg-white/10" index={index + 1} />
          </div>
        ))}
      </section>
    </main>
  );
}
