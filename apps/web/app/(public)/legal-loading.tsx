import { Skeleton } from '@nexakabi/ui';

/**
 * Attente des pages légales et d'aide.
 *
 * ── Pourquoi elles en ont besoin alors qu'elles sont statiques ────────────
 * Leur contenu est écrit en dur, mais il traverse quand même le réseau : la
 * charge du routeur doit arriver avant que le texte s'affiche. Sur une 3G, ça
 * se compte en secondes — et sans ce fichier, c'est le squelette de l'ACCUEIL
 * qui s'afficherait à leur place, hérité de `(public)/loading.tsx`. Une grille
 * de cartes d'événements annonçant les conditions générales : le squelette
 * mentirait sur ce qui arrive, ce qui est pire que pas de squelette du tout.
 *
 * ── Pourquoi des lignes de longueurs inégales ─────────────────────────────
 * Un paragraphe réel ne remplit jamais sa dernière ligne. Des barres toutes
 * identiques se lisent comme un tableau, pas comme du texte.
 */
const PARAGRAPH_WIDTHS = ['100%', '96%', '88%'] as const;

export function LegalLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-[34px] w-[280px] max-w-full" />
        <Skeleton className="h-[10px] w-[190px]" index={1} />
        <Skeleton className="mt-1 h-[13px] w-full" index={2} />
      </header>

      <div className="flex flex-col gap-6">
        {Array.from({ length: 5 }, (_, section) => (
          <section key={section} className="flex flex-col gap-2">
            <Skeleton className="h-[19px] w-[45%]" index={section} />
            {PARAGRAPH_WIDTHS.map((width, line) => (
              <Skeleton key={width} className="h-[11px]" style={{ width }} index={line + 1} />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
