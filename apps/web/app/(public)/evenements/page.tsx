import type { Metadata } from 'next';
import Link from 'next/link';
import { Calendar, Map as MapIcon, Search } from 'lucide-react';
import { Button, CategoryIcon, EventCardStandard, SearchEmptyState, Surface } from '@nexakabi/ui';
import { fetchCategories, fetchCities, searchEvents } from '@/lib/events';
import { toCard } from '../page';
import { DiscoverFilters } from './discover-filters';
import { DATE_FILTERS, buildDiscoverHref } from './discover-shared';

export const metadata: Metadata = {
  title: 'Découvrir les événements',
  description:
    'Concerts, festivals, conférences et soirées au Bénin. Filtre par ville, date et prix.',
};

/**
 * Découverte (écran P2).
 *
 * Les filtres vivent dans la query string : la recherche est partageable,
 * indexable et revient à l'identique par le bouton retour du navigateur.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const [result, categories, cities] = await Promise.all([
    searchEvents(params),
    fetchCategories(),
    fetchCities(),
  ]);

  const hasFilters = Boolean(params.ville ?? params.cat ?? params.date ?? params.prix ?? params.q);

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-6 sm:px-5 sm:py-8 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold">Découvrir</h1>
          <p className="text-body-l text-text-2">
            {result.total} événement{result.total > 1 ? 's' : ''} à venir
          </p>
        </div>
        <Button asChild variant="secondary" size="compact" className="hidden lg:inline-flex">
          <Link href="/carte">
            <MapIcon className="size-4" aria-hidden />
            Voir sur la carte
          </Link>
        </Button>
      </div>

      {/* Le backend accepte `?q=` depuis toujours (les titres d'état vide le
          supposent déjà) : il ne manquait que ce champ. Les autres filtres
          actifs sont repris en champs cachés — chercher un mot ne doit pas
          effacer la ville ou la catégorie déjà choisies. Sur mobile, c'est
          ICI que vit la recherche — pas dans l'en-tête — comme le prototype
          le demande : elle mérite le clavier plein écran. */}
      <form action="/evenements" className="flex gap-2">
        {Object.entries(params)
          .filter(([key, value]) => key !== 'q' && key !== 'page' && Boolean(value))
          .map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <div className="relative w-full max-w-[460px]">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-text-3"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            enterKeyHint="search"
            defaultValue={params.q ?? ''}
            placeholder="Concert, formation, artiste, lieu…"
            aria-label="Rechercher un événement"
            className="min-h-[var(--tap-mobile)] w-full rounded-field border border-border-field bg-surface pl-10 pr-3.5 text-[15px] placeholder:text-text-3 focus:border-text-strong focus:shadow-[var(--focus-ring)] focus:outline-none sm:min-h-[var(--tap-min)] sm:text-body"
          />
        </div>
        <Button type="submit" variant="secondary" size="default" className="hidden sm:inline-flex">
          Rechercher
        </Button>
      </form>

      <DiscoverFilters params={params} categories={categories} cities={cities} total={result.total} />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
        {/* Palier desktop : colonne de filtres persistante. En dessous, la
            feuille basse `DiscoverFilters` prend le relais — jamais un
            panneau qui masque la grille sur un petit écran. */}
        <Surface
          variant="panel"
          padding="comfortable"
          className="hidden flex-col gap-5 lg:sticky lg:top-[86px] lg:flex"
        >
          <FilterGroup title="Quand">
            <div className="flex flex-wrap gap-1.5">
              {DATE_FILTERS.map(([value, label]) => (
                <FilterChip
                  key={value}
                  label={label}
                  href={buildHref(params, 'date', value)}
                  active={params.date === value}
                />
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Prix">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                label="Gratuit"
                href={buildHref(params, 'prix', 'gratuit')}
                active={params.prix === 'gratuit'}
              />
              <FilterChip
                label="Payant"
                href={buildHref(params, 'prix', 'payant')}
                active={params.prix === 'payant'}
              />
            </div>
          </FilterGroup>

          <FilterGroup title="Ville">
            <div className="flex flex-wrap gap-1.5">
              {cities.map((city) => (
                <FilterChip
                  key={city.id}
                  label={city.name}
                  href={buildHref(params, 'ville', city.slug)}
                  active={params.ville === city.slug}
                />
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title="Catégorie" id="categorie">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  label={category.name}
                  icon={<CategoryIcon slug={category.slug} className="size-3.5" />}
                  href={buildHref(params, 'cat', category.slug)}
                  active={params.cat === category.slug}
                />
              ))}
            </div>
          </FilterGroup>

          {hasFilters ? (
            <Link href="/evenements" className="text-body-s font-semibold">
              Effacer les filtres
            </Link>
          ) : null}
        </Surface>

        {result.items.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((event) => (
              <EventCardStandard key={event.id} event={toCard(event)} href={`/e/${event.slug}`} />
            ))}
          </div>
        ) : (
          <Surface variant="panel" padding="none" className="overflow-hidden">
            {/* Un état vide qui ne propose aucune sortie est un cul-de-sac :
                on offre toujours au moins deux relances. */}
            <SearchEmptyState
              title={buildEmptyTitle(params, cities)}
              suggestions={[
                { label: 'Voir tous les événements à venir' },
                { label: 'Les événements gratuits' },
                { label: 'Ce week-end', icon: <Calendar className="size-4" /> },
              ]}
            />
            <div className="flex flex-wrap gap-2 border-t border-border-subtle px-6 pb-6">
              <Link href="/evenements" className="text-body-s font-semibold">
                Tous les événements
              </Link>
              <span className="text-text-3">·</span>
              <Link href="/evenements?prix=gratuit" className="text-body-s font-semibold">
                Gratuit
              </Link>
              <span className="text-text-3">·</span>
              <Link href="/evenements?date=this_weekend" className="text-body-s font-semibold">
                Ce week-end
              </Link>
            </div>
          </Surface>
        )}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FilterGroup({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="flex scroll-mt-24 flex-col gap-2">
      <p className="eyebrow text-text-3">{title}</p>
      {children}
    </div>
  );
}

function FilterChip({
  label,
  icon,
  href,
  active,
}: {
  label: string;
  icon?: React.ReactNode;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-body-s font-semibold text-white'
          : 'inline-flex items-center gap-1.5 rounded-full border border-border-field bg-surface px-3 py-1.5 text-body-s font-semibold text-text-2 hover:bg-paper'
      }
    >
      {icon}
      {label}
    </Link>
  );
}

/** Bascule un filtre : recliquer sur un filtre actif le retire. */
function buildHref(params: Record<string, string | undefined>, key: string, value: string): string {
  return buildDiscoverHref({ ...params, [key]: params[key] === value ? undefined : value });
}

function buildEmptyTitle(
  params: Record<string, string | undefined>,
  cities: ReadonlyArray<{ slug: string; name: string }>,
): string {
  // Le nom de la ville, jamais son slug : « Rien à Abomey-Calavi », pas
  // « rien à abomey-calavi ».
  const city = cities.find((entry) => entry.slug === params.ville)?.name ?? params.ville;

  if (params.q && city) return `Rien pour « ${params.q} » à ${city}`;
  if (params.q) return `Rien pour « ${params.q} »`;
  if (city) return `Rien à ${city} pour l’instant`;
  return 'Aucun événement ne correspond';
}
