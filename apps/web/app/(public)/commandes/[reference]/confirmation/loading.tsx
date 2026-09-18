import { Check } from 'lucide-react';
import { Skeleton } from '@nexakabi/ui';

/**
 * La confirmation, pendant que la commande se relit.
 *
 * ── Pourquoi la coche est vraie et non grisée ─────────────────────────────
 * On n'arrive sur cette adresse qu'après un paiement validé par l'opérateur.
 * La réponse à la seule question qui compte — « est-ce que c'est passé ? » —
 * est donc connue avant même que la commande soit relue : la pastille menthe
 * et le titre s'affichent tout de suite. Ne restent en attente que le détail
 * du montant et la liste des billets.
 *
 * L'inverse — griser la coche puis la révéler — ferait vivre à l'acheteur
 * deux secondes de doute sur de l'argent déjà débité. C'est exactement le
 * moment où il ne faut pas hésiter.
 */
export default function ConfirmationLoading() {
  return (
    <main className="min-h-dvh bg-ink px-5 py-10 text-white">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-mint text-ink" aria-hidden>
            <Check className="size-6" strokeWidth={3} />
          </span>
          <div className="flex flex-col items-center gap-2">
            <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">C’est confirmé</h1>
            <Skeleton className="h-[13px] w-[240px] max-w-full bg-white/12" />
          </div>
        </header>

        <section className="rounded-panel bg-white/[0.06] p-5">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-baseline justify-between gap-4">
                <Skeleton className="h-[11px] w-[80px] bg-white/12" index={index} />
                <Skeleton className="h-[11px] w-[45%] bg-white/12" index={index + 1} />
              </div>
            ))}

            <div className="my-1 h-px bg-white/12" />

            <div className="flex items-baseline justify-between gap-4">
              <Skeleton className="h-[11px] w-[130px] bg-white/12" index={1} />
              <Skeleton className="h-[11px] w-[70px] bg-white/12" index={2} />
            </div>

            <div className="mt-1 flex items-baseline justify-between border-t border-white/12 pt-3">
              <span className="text-body font-bold">Montant payé</span>
              <Skeleton className="h-[30px] w-[130px] bg-white/12" index={3} />
            </div>
          </div>
        </section>

        <section className="rounded-panel border border-white/12 p-5">
          <Skeleton className="h-[13px] w-[130px] bg-white/12" />
          <div className="mt-3 flex flex-col gap-2.5">
            {Array.from({ length: 2 }, (_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 border-t border-white/12 pt-2.5 first:border-t-0 first:pt-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <Skeleton className="h-[11px] w-[120px] bg-white/12" index={index} />
                  <Skeleton className="h-[9px] w-[80px] bg-white/12" index={index + 1} />
                </div>
                <Skeleton className="h-[var(--tap-min)] w-[104px] rounded-button bg-white/12" index={index} />
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton
              key={index}
              className="h-[var(--tap-primary)] w-full rounded-button bg-white/12"
              index={index}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
