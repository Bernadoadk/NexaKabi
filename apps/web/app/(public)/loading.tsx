import { EventCardSkeleton, Skeleton } from '@nexakabi/ui';

/**
 * L'accueil, pendant qu'il se remplit.
 *
 * ── Le bloc encre est dessiné pour de vrai, pas en gris ───────────────────
 * Le titre et le champ de recherche de l'accueil ne dépendent d'aucune
 * donnée : les mettre en gris reviendrait à faire attendre pour quelque chose
 * qu'on connaît déjà. Seuls les raccourcis de catégories et les cartes
 * d'événements sont incertains, et eux seuls sont donc en attente.
 *
 * Le bloc garde ses paliers d'origine — encre et pleine largeur sous `md`,
 * fond papier au-dessus — sinon la bascule à l'arrivée des données ferait
 * sauter tout l'écran sur mobile, là où ça se voit le plus.
 */
export default function HomeLoading() {
  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 pb-8 pt-0 sm:px-5 sm:pt-6 md:gap-12 md:py-8">
      <section className="-mx-4 flex flex-col gap-4 bg-ink px-4 pb-5 pt-5 text-white sm:-mx-5 sm:px-5 md:mx-0 md:gap-5 md:rounded-block md:bg-transparent md:p-0 md:text-text">
        <div className="flex flex-col gap-2 md:gap-3">
          <h1 className="max-w-[760px] font-display text-[26px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-h1 md:text-display">
            Ce qui se passe près de toi,{' '}
            <span className="text-coral-300 md:text-coral">ce soir.</span>
          </h1>
          <p className="max-w-[620px] text-body text-on-ink-2 md:text-body-l md:text-text-2">
            Découvre les événements près de chez toi, prends ton billet en Mobile Money et présente
            ton QR Code à l’entrée.
          </p>
        </div>

        <div className="flex gap-2">
          <Skeleton className="h-[var(--tap-mobile)] w-full rounded-[13px] bg-white/12 md:max-w-[460px] md:bg-fill-muted" />
          <Skeleton className="size-[var(--tap-mobile)] shrink-0 rounded-[13px] bg-white/12 md:size-[var(--tap-min)] md:bg-fill-muted" />
        </div>

        {/* Onze raccourcis : « Ce soir », « Week-end », « Gratuit », puis les
            huit premières catégories — le compte exact de la page réelle. */}
        <div className="-mx-4 flex gap-2 overflow-hidden px-4 sm:-mx-5 sm:px-5 md:mx-0 md:flex-wrap md:px-0">
          {Array.from({ length: 11 }, (_, index) => (
            <Skeleton
              key={index}
              index={index}
              className="h-[36px] w-[104px] shrink-0 rounded-full bg-white/12 md:bg-fill-muted"
            />
          ))}
        </div>
      </section>

      {/* La une : une grande carte à gauche, six standard à droite. */}
      <section className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
        {/* `EventCardLarge` est un bloc PLEIN de 330 px : l'image occupe toute
            la carte et le texte se pose dessus. Un squelette en deux parties
            — image puis corps blanc — annoncerait la mauvaise carte. */}
        <Skeleton className="h-[330px] w-full rounded-panel" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <EventCardSkeleton key={index} />
          ))}
        </div>
      </section>

      {/* « Ce week-end » puis « Gratuit ». Les titres sont connus d'avance :
          seule la garniture attend. */}
      {['Ce week-end', 'Gratuit'].map((title) => (
        <section key={title} className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-h2 font-bold">{title}</h2>
            <Skeleton className="h-[11px] w-[70px]" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <EventCardSkeleton key={index} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
