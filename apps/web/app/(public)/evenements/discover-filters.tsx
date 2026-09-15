'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Map as MapIcon, SlidersHorizontal, X } from 'lucide-react';
import { BottomSheet, Button, CategoryIcon, cn } from '@nexakabi/ui';
import type { Category, City } from '@/lib/events';
import { DATE_FILTERS, buildDiscoverHref, type DiscoverParams } from './discover-shared';

const FILTER_KEYS = ['date', 'prix', 'ville', 'cat'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

/**
 * Filtres de la découverte, sous le palier desktop.
 *
 * ── Ce que le prototype demande ─────────────────────────────────────────────
 * « Les filtres deviennent un bottom sheet manipulable au pouce, avec un
 * bouton de validation. » Sur un téléphone, la colonne de filtres passait
 * AU-DESSUS de la grille : quatre groupes de pastilles à faire défiler avant
 * de voir le premier événement. Ici, une barre — recherche, carte, bouton
 * « Filtres » avec le nombre de filtres actifs — et une feuille qui monte
 * depuis le bas. On choisit, puis on valide : la page ne se recharge pas à
 * chaque pastille.
 *
 * Les choix restent dans l'URL, comme sur desktop : la feuille ne fait que
 * les composer avant de naviguer.
 */
export function DiscoverFilters({
  params,
  categories,
  cities,
  total,
}: {
  params: DiscoverParams;
  categories: Category[];
  cities: City[];
  total: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<FilterKey, string | undefined>>(() => pick(params));

  // Rouvrir la feuille repart des filtres réellement appliqués, pas d'un
  // brouillon abandonné.
  React.useEffect(() => {
    if (open) setDraft(pick(params));
  }, [open, params]);

  const activeCount = FILTER_KEYS.filter((key) => Boolean(params[key])).length;
  const draftCount = FILTER_KEYS.filter((key) => Boolean(draft[key])).length;

  function toggle(key: FilterKey, value: string) {
    setDraft((current) => ({ ...current, [key]: current[key] === value ? undefined : value }));
  }

  function apply() {
    setOpen(false);
    router.push(buildDiscoverHref({ ...params, ...draft, page: undefined }));
  }

  const activeChips: Array<{ key: FilterKey; label: string }> = [];
  if (params.date) {
    const label = DATE_FILTERS.find(([value]) => value === params.date)?.[1];
    if (label) activeChips.push({ key: 'date', label });
  }
  if (params.prix) activeChips.push({ key: 'prix', label: params.prix === 'gratuit' ? 'Gratuit' : 'Payant' });
  if (params.ville) {
    const label = cities.find((city) => city.slug === params.ville)?.name;
    if (label) activeChips.push({ key: 'ville', label });
  }
  if (params.cat) {
    const label = categories.find((category) => category.slug === params.cat)?.name;
    if (label) activeChips.push({ key: 'cat', label });
  }

  return (
    <div className="flex flex-col gap-3 lg:hidden">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={activeCount > 0 ? 'ink' : 'secondary'}
          size="default"
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtres
          {activeCount > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-coral text-[11px] font-bold text-ink">
              {activeCount}
            </span>
          ) : null}
        </Button>

        <Button asChild variant="secondary" size="default" className="shrink-0">
          <Link href="/carte">
            <MapIcon className="size-4" aria-hidden />
            Carte
          </Link>
        </Button>

        <span className="ml-auto text-body-s text-text-2">
          {total} résultat{total > 1 ? 's' : ''}
        </span>
      </div>

      {activeChips.length > 0 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeChips.map((chip) => (
            <Link
              key={chip.key}
              href={buildDiscoverHref({ ...params, [chip.key]: undefined })}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink py-1.5 pl-3 pr-2 text-body-s font-semibold text-white"
              aria-label={`Retirer le filtre ${chip.label}`}
            >
              {chip.label}
              <X className="size-3.5" aria-hidden />
            </Link>
          ))}
          <Link
            href="/evenements"
            className="inline-flex shrink-0 items-center rounded-full px-2 text-body-s font-semibold text-text-2"
          >
            Tout effacer
          </Link>
        </div>
      ) : null}

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Filtrer"
        description="Choisis, puis valide : la liste se met à jour d’un coup."
        footer={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="tertiary"
              size="mobile"
              onClick={() => setDraft({ date: undefined, prix: undefined, ville: undefined, cat: undefined })}
              disabled={draftCount === 0}
            >
              Effacer
            </Button>
            <Button type="button" variant="primary" size="mobile" block onClick={apply}>
              Voir les résultats
              {draftCount > 0 ? ` · ${draftCount} filtre${draftCount > 1 ? 's' : ''}` : ''}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <SheetGroup title="Quand">
            {DATE_FILTERS.map(([value, label]) => (
              <SheetChip key={value} active={draft.date === value} onClick={() => toggle('date', value)}>
                {label}
              </SheetChip>
            ))}
          </SheetGroup>

          <SheetGroup title="Prix">
            <SheetChip active={draft.prix === 'gratuit'} onClick={() => toggle('prix', 'gratuit')}>
              Gratuit
            </SheetChip>
            <SheetChip active={draft.prix === 'payant'} onClick={() => toggle('prix', 'payant')}>
              Payant
            </SheetChip>
          </SheetGroup>

          <SheetGroup title="Ville">
            {cities.map((city) => (
              <SheetChip key={city.id} active={draft.ville === city.slug} onClick={() => toggle('ville', city.slug)}>
                {city.name}
              </SheetChip>
            ))}
          </SheetGroup>

          <SheetGroup title="Catégorie">
            {categories.map((category) => (
              <SheetChip
                key={category.id}
                active={draft.cat === category.slug}
                onClick={() => toggle('cat', category.slug)}
              >
                <CategoryIcon slug={category.slug} className="size-3.5" />
                {category.name}
              </SheetChip>
            ))}
          </SheetGroup>
        </div>
      </BottomSheet>
    </div>
  );
}

function pick(params: DiscoverParams): Record<FilterKey, string | undefined> {
  return { date: params.date, prix: params.prix, ville: params.ville, cat: params.cat };
}

function SheetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow text-text-3">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SheetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-body-s font-semibold transition-colors',
        active
          ? 'bg-ink text-white'
          : 'border border-border-field bg-surface text-text-2 hover:bg-paper hover:text-text-strong',
      )}
    >
      {children}
    </button>
  );
}
