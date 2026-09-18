import { Skeleton } from '@nexakabi/ui';

/**
 * Le billet, pendant qu'il arrive.
 *
 * ── Qui regarde cet écran, et dans quelles conditions ─────────────────────
 * Quelqu'un debout devant une porte, à qui l'on demande son QR Code. Ce lien
 * lui a souvent été transféré sur WhatsApp : il n'a pas de compte, il ne sait
 * pas si le lien est encore bon, et la file avance derrière lui. Un écran
 * blanc à cet instant précis se lit comme « ton billet n'existe pas ».
 *
 * Le billet est donc dessiné entier — volet encre, perforation, emplacement du
 * QR à sa taille finale : la forme suffit à dire « c'est bien ton billet, il
 * finit de charger ».
 *
 * Les barres sont en `bg-white/12` et non en gris du système : posées sur
 * l'encre du billet, les grises seraient presque invisibles.
 */
export default function TicketLoading() {
  return (
    <main className="mx-auto w-full max-w-[520px] px-5 pb-16 pt-6">
      <article className="overflow-hidden rounded-block bg-surface shadow-lg">
        <header className="flex flex-col gap-2 bg-ink px-6 pb-6 pt-5">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-[9px] w-[150px] bg-white/12" />
            <Skeleton className="h-[22px] w-[74px] rounded-full bg-white/12" index={1} />
          </div>
          <Skeleton className="h-[26px] w-[80%] bg-white/12" index={2} />
          <Skeleton className="h-[11px] w-[55%] bg-white/12" index={3} />
        </header>

        {/* La perforation : deux encoches et le pointillé, à l'identique du
            vrai billet — c'est ce qui le rend reconnaissable au premier coup
            d'œil, avant même que le QR soit là. */}
        <div className="relative h-6 bg-ink">
          <span className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-paper" />
          <span className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-paper" />
          <span className="absolute inset-x-6 top-1/2 border-t border-dashed border-white/25" />
        </div>

        <div className="flex flex-col items-center gap-4 bg-ink px-6 pb-7 pt-2">
          {/* Le QR à sa dimension réelle : 208 px de code plus les 12 px de
              marge blanche de `QrDisplay`, sans quoi tout ce qui suit se
              décalerait à l'arrivée du billet. C'est aussi le seul élément de
              l'écran que le contrôleur va chercher des yeux. */}
          <Skeleton className="size-[232px] rounded-card bg-white/12" />
          <Skeleton className="h-[11px] w-[140px] bg-white/12" index={1} />

          <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3 border-t border-white/12 pt-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Skeleton className="h-[9px] w-[60%] bg-white/12" index={index} />
                <Skeleton className="h-[13px] w-[80%] bg-white/12" index={index + 1} />
              </div>
            ))}
          </div>
        </div>
      </article>

      {/* Le panneau « retrouver ce billet plus tard » n'attend aucune donnée :
          il est écrit en dur dans la page. Le griser ferait patienter pour du
          texte déjà connu. */}
      <div className="mt-6 flex flex-col gap-2.5 rounded-panel border border-border-subtle p-5">
        <h2 className="text-body font-bold">Retrouver ce billet plus tard</h2>
        <p className="text-body-s text-text-2">
          Conserve ce lien, ou connecte-toi avec le numéro qui a servi à l’achat : tes billets
          t’attendent dans « Mes billets ».
        </p>
      </div>
    </main>
  );
}
