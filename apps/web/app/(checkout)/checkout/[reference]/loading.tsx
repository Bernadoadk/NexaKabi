import { Skeleton } from '@nexakabi/ui';

/**
 * Le tunnel d'achat, entre deux étapes.
 *
 * ── Pourquoi un seul fichier pour les trois écrans ────────────────────────
 * Billets, récapitulatif et paiement partagent exactement la même armature :
 * la frise des étapes, un titre avec sa référence à droite, le rappel de la
 * commande, puis le bloc d'action. Ce qui change d'un écran à l'autre est le
 * CONTENU de ce dernier bloc — donc rien que le squelette pourrait annoncer
 * honnêtement. Posé au niveau de `[reference]`, celui-ci couvre les trois.
 *
 * ── Pourquoi il compte plus ici qu'ailleurs ───────────────────────────────
 * C'est le seul endroit du produit où l'utilisateur a déjà décidé d'acheter.
 * Un écran vide entre deux étapes se lit comme une transaction qui a échoué,
 * et l'acheteur qui doute recommence depuis la page événement — quand il ne
 * referme pas l'onglet. La frise reste donc dessinée en entier : elle dit où
 * on en est, et qu'on n'a rien perdu.
 */
export default function CheckoutLoading() {
  return (
    <>
      {/* La frise : trois pastilles et deux traits, à la géométrie exacte de
          `CheckoutStepper`. Elle est la seule chose qu'on puisse promettre
          sans rien savoir de l'étape qui arrive. */}
      <nav aria-hidden className="mb-6">
        <ol className="flex items-center gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex flex-1 items-center gap-2">
              <span className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-full" index={index} />
                <Skeleton className="hidden h-[11px] w-[76px] sm:block" index={index} />
              </span>
              {index < 2 ? <span className="h-px flex-1 bg-border" /> : null}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-col gap-5">
        <header className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-[28px] w-[200px]" />
          <Skeleton className="h-[10px] w-[74px]" index={1} />
        </header>

        {/* Le rappel de la commande, bordures comprises : c'est un panneau
            sectionné, pas un rectangle plein. */}
        <div className="overflow-hidden rounded-panel border border-border bg-surface">
          <div className="flex flex-col gap-2 border-b border-border-subtle px-5 py-4">
            <Skeleton className="h-[9px] w-[150px]" />
            <Skeleton className="h-[19px] w-[70%]" index={1} />
            <Skeleton className="h-[11px] w-[45%]" index={2} />
          </div>

          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3"
            >
              <Skeleton className="h-[11px] w-[40%]" index={index} />
              <Skeleton className="h-[11px] w-[70px]" index={index + 1} />
            </div>
          ))}

          <div className="flex flex-col gap-2.5 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-[11px] w-[45%]" />
              <Skeleton className="h-[11px] w-[64px]" index={1} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <Skeleton className="h-[13px] w-[110px]" index={2} />
              <Skeleton className="h-[26px] w-[120px]" index={3} />
            </div>
          </div>
        </div>

        {/* Le bloc d'action. Sans cadre : à l'étape des coordonnées, c'est un
            formulaire nu posé sur le papier, et lui dessiner une bordure qui
            n'arrivera jamais ferait sauter l'écran. Deux couples
            libellé + champ, puis le bouton à sa hauteur définitive — la seule
            chose que les trois étapes ont toujours en commun. */}
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <Skeleton className="h-[11px] w-[160px]" index={index} />
              <Skeleton className="h-[var(--tap-min)] w-full rounded-field" index={index + 1} />
            </div>
          ))}
          <Skeleton className="h-[var(--tap-primary)] w-full rounded-button" index={3} />
        </div>
      </div>
    </>
  );
}
