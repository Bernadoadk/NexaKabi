import type { Metadata } from 'next';
import Link from 'next/link';
import { Map as MapIcon, Search, Ticket } from 'lucide-react';
import { CategoryIcon, EventCardLarge, EventCardStandard, EmptyState } from '@nexakabi/ui';
import type { EventSummary } from '@nexakabi/contracts';
import { fetchCategories, fetchHomeSections } from '@/lib/events';

export const metadata: Metadata = {
  title: 'Découvre et vis les événements au Bénin',
  description:
    'Concerts, festivals, conférences et soirées près de chez toi. Achète ton billet en ' +
    'Mobile Money et reçois ton QR Code.',
};

/**
 * Accueil public (écran P1).
 *
 * Rendu côté serveur et revalidé périodiquement : la première impression doit
 * arriver vite, y compris sur une connexion 3G et un Android d'entrée de gamme.
 *
 * ── Mobile ──────────────────────────────────────────────────────────────────
 * Le prototype ouvre sur un bloc encre : « Ce qui se passe près de toi, ce
 * soir. », un champ de recherche blanc, puis une rangée de raccourcis (Ce
 * soir, Week-end, Gratuit, Musique). Sous le palier `md`, c'est ce bloc qui
 * accueille ; au-dessus, la même section respire sur fond papier, avec la
 * recherche à portée de main.
 */
export default async function HomePage() {
  const [sections, categories] = await Promise.all([fetchHomeSections(), fetchCategories()]);
  const [hero, ...rest] = sections.upcoming;

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

        <form action="/evenements" className="flex gap-2">
          <div className="relative w-full md:max-w-[460px]">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-text-3"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              enterKeyHint="search"
              placeholder="Concert, formation, artiste…"
              aria-label="Rechercher un événement"
              className="min-h-[var(--tap-mobile)] w-full rounded-[13px] border border-transparent bg-white pl-10 pr-3.5 text-[15px] text-ink placeholder:text-text-3 focus:outline-none md:rounded-field md:border-border-field md:bg-surface md:text-text md:focus:border-text-strong md:focus:shadow-[var(--focus-ring)]"
            />
          </div>
          <Link
            href="/carte"
            aria-label="Voir la carte des événements"
            className="flex size-[var(--tap-mobile)] shrink-0 items-center justify-center rounded-[13px] bg-white/12 text-white transition hover:bg-white/20 md:size-[var(--tap-min)] md:rounded-field md:border md:border-border-field md:bg-surface md:text-text-strong md:hover:bg-paper"
          >
            <MapIcon className="size-5" />
          </Link>
        </form>

        <nav
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-5 sm:px-5 md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
          aria-label="Raccourcis"
        >
          <QuickChip href="/evenements?date=today" primary>
            Ce soir
          </QuickChip>
          <QuickChip href="/evenements?date=this_weekend">Week-end</QuickChip>
          <QuickChip href="/evenements?prix=gratuit">Gratuit</QuickChip>
          {categories.slice(0, 8).map((category) => (
            <QuickChip key={category.id} href={`/evenements?cat=${category.slug}`}>
              <CategoryIcon slug={category.slug} className="size-3.5" />
              {category.name}
            </QuickChip>
          ))}
        </nav>
      </section>

      {hero ? (
        <section className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
          <EventCardLarge event={toCard(hero)} href={`/e/${hero.slug}`} />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rest.slice(0, 6).map((event) => (
              <EventCardStandard key={event.id} event={toCard(event)} href={`/e/${event.slug}`} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<Ticket size={26} />}
          title="Aucun événement pour l’instant"
          description="Les premiers événements arrivent bientôt. Reviens dans quelques jours."
        />
      )}

      <Section
        title="Ce week-end"
        href="/evenements?date=this_weekend"
        events={sections.thisWeekend}
      />
      <Section title="Gratuit" href="/evenements?prix=gratuit" events={sections.free} />
    </main>
  );
}

function QuickChip({
  href,
  primary = false,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? 'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-coral px-3.5 text-body-s font-bold text-ink transition-colors hover:bg-coral-hover'
          : 'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 text-body-s font-semibold text-white transition-colors hover:bg-white/20 md:border-border-field md:bg-surface md:text-text-strong md:hover:bg-paper'
      }
    >
      {children}
    </Link>
  );
}

function Section({ title, href, events }: { title: string; href: string; events: EventSummary[] }) {
  if (events.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-h2 font-bold">{title}</h2>
        <Link href={href} className="text-body-s font-semibold">
          Tout voir
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {events.map((event) => (
          <EventCardStandard key={event.id} event={toCard(event)} href={`/e/${event.slug}`} />
        ))}
      </div>
    </section>
  );
}

/** Traduit la réponse de l'API vers le composant de carte du design system. */
export function toCard(event: EventSummary) {
  return {
    slug: event.slug,
    title: event.title,
    startsAt: new Date(event.startsAt),
    venueName: event.venueName ?? undefined,
    cityName: event.cityName ?? undefined,
    categoryName: event.categoryName,
    categoryColor: event.categoryColor,
    coverImageUrl: event.coverImageUrl,
    fromPrice: event.fromPrice ?? undefined,
    feeAmount: event.feeAmount ?? undefined,
    remainingSeats: event.remainingSeats ?? undefined,
    isSoldOut: event.isSoldOut,
    isAlmostSoldOut: event.isAlmostSoldOut,
    ageRestriction: event.minimumAge ? `${event.minimumAge} ans+` : undefined,
  };
}
