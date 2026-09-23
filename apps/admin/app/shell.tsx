import {
  Banknote,
  Building2,
  CalendarDays,
  Flag,
  Globe2,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import { ADMIN_ROLE_LABELS, type AdminSpace } from '@nexakabi/contracts';
import {
  Avatar,
  ConsoleShell,
  DrawerNavLink,
  DrawerSection,
  SectionNav,
  ThemeToggle,
  type BottomTabEntry,
} from '@nexakabi/ui';
import { hasAdminAccess, type AdminUser } from '@/lib/session';
import { ADMIN_NAV_ENTRIES } from './nav';
import { LogoutButton } from './logout-button';

/**
 * Cadre commun de la console.
 *
 * ── Pourquoi le nom et le rôle sont toujours affichés ────────────────────
 * Parce qu'on partage un poste, et qu'une action prise sous le compte de
 * quelqu'un d'autre est intraçable de fait — l'audit dira « Aminata a gelé ces
 * fonds » alors que c'était son collègue. Voir le nom en permanence rend
 * l'erreur difficile à commettre sans la remarquer.
 *
 * ── Ce que chacun voit ────────────────────────────────────────────────────
 * Les entrées sont filtrées par les droits : un employé ne voit que ses
 * espaces, le propriétaire voit tout plus « Équipe ». C'est un confort, pas
 * une protection — l'API refuse de toute façon ce que le menu ne montre pas.
 */
const ICONS: Record<string, React.ReactNode> = {
  '/': <LayoutDashboard />,
  '/evenements': <CalendarDays />,
  '/verifications': <ShieldCheck />,
  '/signalements': <Flag />,
  '/organisations': <Building2 />,
  '/utilisateurs': <Users />,
  '/retraits': <Banknote />,
  '/finance': <Landmark />,
  '/parametres': <Globe2 />,
  '/equipe': <UsersRound />,
};

export function AdminShell({ user, children }: { user: AdminUser; children: React.ReactNode }) {
  const role = ADMIN_ROLE_LABELS[user.role];

  const entries = ADMIN_NAV_ENTRIES.filter((entry) => {
    if (entry.ownerOnly) return user.role === 'OWNER';
    if (entry.space) return hasAdminAccess(user, entry.space as AdminSpace, 'read');
    return true;
  });

  // Cinq onglets au plus dans la barre basse : le tableau de bord, puis les
  // premiers espaces autorisés. Le tiroir porte le reste.
  const tabs: BottomTabEntry[] = entries.slice(0, 5).map((entry) => ({
    href: entry.href,
    label: entry.label === 'Tableau de bord' ? 'Tableau' : entry.label,
    icon: ICONS[entry.href] ?? <LayoutDashboard />,
    exact: entry.exact,
  }));

  return (
    <ConsoleShell
      brandLabel="Administration"
      nav={<SectionNav entries={entries} ariaLabel="Administration" />}
      headerEnd={
        <>
          <ThemeToggle className="hidden lg:inline-flex" />
          <div className="flex shrink-0 items-center gap-2">
            <Avatar name={user.fullName} size="compact" />
            <span className="hidden max-w-[260px] truncate whitespace-nowrap text-body-s text-text-2 lg:inline">
              {user.fullName} · {role}
            </span>
          </div>
          <LogoutButton className="shrink-0 whitespace-nowrap" />
        </>
      }
      mobileMenu={{
        title: 'Administration',
        header: (
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} size="default" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-bold text-text-strong">{user.fullName}</p>
              <p className="truncate text-micro text-text-3">
                {role} · {user.username}
              </p>
            </div>
          </div>
        ),
        footer: (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-s font-semibold text-text-2">Thème</span>
              <ThemeToggle />
            </div>
            <LogoutButton className="w-full justify-center rounded-button border border-border-field" />
          </>
        ),
        children: (
          <>
            {entries.map((entry) => (
              <DrawerNavLink
                key={entry.href}
                href={entry.href}
                label={entry.label}
                icon={ICONS[entry.href]}
                exact={entry.exact}
              />
            ))}
            <DrawerSection>Mon compte</DrawerSection>
            <DrawerNavLink href="/mon-compte" label="Mot de passe" icon={<KeyRound />} muted />
          </>
        ),
      }}
      mobileTabs={tabs}
    >
      {children}
    </ConsoleShell>
  );
}
