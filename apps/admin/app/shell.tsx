import {
  Banknote,
  Building2,
  CalendarDays,
  Flag,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  Avatar,
  ConsoleShell,
  DrawerNavLink,
  DrawerSection,
  SectionNav,
  ThemeToggle,
} from '@nexakabi/ui';
import type { AdminUser } from '@/lib/session';
import { ADMIN_NAV_ENTRIES } from './nav';
import { LogoutButton } from './logout-button';

/**
 * Cadre commun de la console.
 *
 * ── Pourquoi le nom et le rôle sont toujours affichés ────────────────────
 * Parce qu'on partage un poste, et qu'une action prise sous le compte de
 * quelqu'un d'autre est intraçable de fait — l'audit dira « Aminata a gelé ces
 * fonds » alors que c'était son collègue. Voir le nom en permanence rend
 * l'erreur difficile à commettre sans la remarquer. Sur mobile, ce nom vit en
 * tête du tiroir : il s'affiche à chaque ouverture du menu.
 *
 * ── Mobile ────────────────────────────────────────────────────────────────
 * Même chrome que l'espace organisateur (`ConsoleShell`) : un tiroir pour
 * toutes les files, une barre basse pour les quatre qu'on consulte le plus —
 * ce qui attend une décision humaine d'abord.
 */
export function AdminShell({ user, children }: { user: AdminUser; children: React.ReactNode }) {
  const role = ROLE_LABELS[user.role] ?? user.role;

  return (
    <ConsoleShell
      brandLabel="Administration"
      nav={<SectionNav entries={ADMIN_NAV_ENTRIES} ariaLabel="Administration" />}
      headerEnd={
        <>
          <ThemeToggle />
          <div className="flex items-center gap-2">
            <Avatar name={user.fullName} size="compact" />
            <span className="text-body-s text-text-2">
              {user.fullName} · {role}
            </span>
          </div>
          <LogoutButton />
        </>
      }
      mobileMenu={{
        title: 'Administration',
        header: (
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} size="default" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-bold text-text-strong">{user.fullName}</p>
              <p className="text-micro text-text-3">{role}</p>
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
            <DrawerNavLink href="/" label="Tableau de bord" icon={<LayoutDashboard />} exact />
            <DrawerSection>Files</DrawerSection>
            <DrawerNavLink href="/evenements" label="Événements" icon={<CalendarDays />} />
            <DrawerNavLink href="/verifications" label="Vérifications" icon={<ShieldCheck />} />
            <DrawerNavLink href="/signalements" label="Signalements" icon={<Flag />} />
            <DrawerNavLink href="/retraits" label="Retraits" icon={<Banknote />} />
            <DrawerSection>Annuaire</DrawerSection>
            <DrawerNavLink href="/organisations" label="Organisations" icon={<Building2 />} />
            <DrawerNavLink href="/utilisateurs" label="Utilisateurs" icon={<Users />} />
          </>
        ),
      }}
      mobileTabs={[
        { href: '/', label: 'Tableau', icon: <LayoutDashboard />, exact: true },
        { href: '/verifications', label: 'Vérifs', icon: <ShieldCheck /> },
        { href: '/evenements', label: 'Événements', icon: <CalendarDays /> },
        { href: '/signalements', label: 'Signalements', icon: <Flag /> },
        { href: '/retraits', label: 'Retraits', icon: <Banknote /> },
      ]}
    >
      {children}
    </ConsoleShell>
  );
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  SUPERADMIN: 'Super-administration',
  ADMIN: 'Administration',
  SUPPORT: 'Support',
};
