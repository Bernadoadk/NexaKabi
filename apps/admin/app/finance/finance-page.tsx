import Link from 'next/link';
import { SectionNav, type SectionNavEntry } from '@nexakabi/ui';
import { hasAdminAccess, type AdminUser } from '@/lib/session';
import { periodPresets, toQuery } from '@/lib/finance';
import { AdminShell } from '../shell';

/**
 * Cadre des écrans Finance : navigation de l'espace, titre, puis le contenu.
 *
 * L'espace regroupe ce qu'un comptable parcourt dans l'ordre d'une question :
 * combien est entré (vue d'ensemble), quoi exactement (transactions), ce qui
 * a raté (échecs), ce qui repart (remboursements, retraits), où c'est inscrit
 * (grand livre), si tout concorde (rapprochement), et ce qu'on en rend
 * (rapports). Les retraits gardent leur espace propre ; ils figurent ici pour
 * qui y a aussi accès.
 */
export function FinancePage({
  user,
  title,
  description,
  actions,
  children,
}: {
  user: AdminUser;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <FinanceNav user={user} />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">{title}</h1>
            {description ? <p className="text-body-s text-text-2">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>

        {children}
      </div>
    </AdminShell>
  );
}

export function FinanceNav({ user }: { user: AdminUser }) {
  const entries: SectionNavEntry[] = [
    { href: '/finance', label: 'Vue d’ensemble', exact: true },
    { href: '/finance/transactions', label: 'Transactions' },
    { href: '/finance/echecs', label: 'Paiements échoués' },
    { href: '/finance/remboursements', label: 'Remboursements' },
    ...(hasAdminAccess(user, 'payouts') ? [{ href: '/retraits', label: 'Retraits' }] : []),
    { href: '/finance/grand-livre', label: 'Grand livre' },
    { href: '/finance/rapprochement', label: 'Rapprochement' },
    { href: '/finance/rapports', label: 'Rapports' },
    { href: '/finance/commissions', label: 'Commissions' },
  ];

  return (
    <SectionNav
      entries={entries}
      ariaLabel="Finance"
      maxWidthClassName="max-w-none"
      className="border-b border-border-subtle px-0"
    />
  );
}

const PILL_ACTIVE = 'rounded-full bg-ink px-3 py-1.5 text-body-s font-semibold text-white';
const PILL_IDLE =
  'rounded-full border border-border-field bg-surface px-3 py-1.5 text-body-s font-semibold text-text-2 hover:bg-paper';

/** Une pastille de filtre : un lien, jamais un état caché de la page. */
export function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={active ? PILL_ACTIVE : PILL_IDLE}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

/**
 * Le filtre de période, en tête de page.
 *
 * Un formulaire GET, sans script : la période vit dans l'adresse, se partage
 * et se recharge telle quelle. Les raccourcis couvrent les questions de tous
 * les jours ; les dates, le reste.
 */
export function PeriodFilter({
  path,
  from,
  to,
  keep = {},
}: {
  path: string;
  from: string;
  to: string;
  /** Autres filtres de la page, conservés quand la période change. */
  keep?: Record<string, string | undefined>;
}) {
  const presets = periodPresets();

  return (
    <div className="flex flex-col gap-2.5">
      <form method="get" action={path} className="flex flex-wrap items-end gap-2">
        {Object.entries(keep).map(([name, value]) =>
          value ? <input key={name} type="hidden" name={name} value={value} /> : null,
        )}
        <label className="flex flex-col gap-1 text-micro font-semibold text-text-2">
          Du
          <input
            type="date"
            name="du"
            defaultValue={from}
            required
            className="h-9 rounded-field border border-border-field bg-surface px-2.5 text-body-s text-text-strong"
          />
        </label>
        <label className="flex flex-col gap-1 text-micro font-semibold text-text-2">
          Au
          <input
            type="date"
            name="au"
            defaultValue={to}
            required
            className="h-9 rounded-field border border-border-field bg-surface px-2.5 text-body-s text-text-strong"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-button border border-border-field bg-surface px-3 text-body-s font-semibold text-text-strong hover:bg-paper"
        >
          Afficher
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <FilterPill
            key={preset.label}
            href={`${path}${toQuery({ ...keep, du: preset.from, au: preset.to })}`}
            active={preset.from === from && preset.to === to}
          >
            {preset.label}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}

/** Pagination par liens : la page vit dans l'adresse, comme les filtres. */
export function Pager({
  path,
  params,
  page,
  pageSize,
  total,
}: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-body-s text-text-2"
    >
      <span className="tabular">
        {total} résultat{total > 1 ? 's' : ''}
        {pages > 1 ? ` · page ${page} sur ${pages}` : ''}
      </span>

      {pages > 1 ? (
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={`${path}${toQuery({ ...params, page: page - 1 })}`} className={PILL_IDLE}>
              ‹ Précédente
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={`${path}${toQuery({ ...params, page: page + 1 })}`} className={PILL_IDLE}>
              Suivante ›
            </Link>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}

/** Lien de téléchargement d'un export, avec les filtres de l'écran. */
export function ExportLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download
      className="inline-flex h-9 items-center rounded-button border border-border-field bg-surface px-3 text-body-s font-semibold text-text-strong hover:bg-paper"
    >
      {children}
    </a>
  );
}
