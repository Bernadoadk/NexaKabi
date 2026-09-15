import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  ScanLine,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react';
import {
  Avatar,
  ConsoleShell,
  DrawerNavLink,
  DrawerSection,
  SectionNav,
  ThemeToggle,
  ToastProvider,
} from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { resolveActiveOrganization } from '@/lib/organizations';
import { fetchNotifications } from '@/lib/notifications';
import { CreateOrganizationForm } from './create-organization-form';
import { OrganizationSwitcher } from './organization-switcher';
import { ProLogoutButton } from './pro-logout-button';

const NAV_ENTRIES = [
  { href: '/pro', label: 'Tableau de bord', exact: true },
  { href: '/pro/evenements', label: 'Événements' },
  { href: '/pro/finances', label: 'Finances' },
  { href: '/pro/equipe', label: 'Équipe' },
  { href: '/pro/parametres', label: 'Paramètres' },
  // Hors de `/pro` : le scanner est une application à part, plein écran, faite
  // pour un téléphone tenu d'une main. Il figure ici parce que c'est d'ici
  // qu'un organisateur le cherche.
  { href: '/scan', label: 'Scanner' },
] as const;

/**
 * Cadre commun de tout l'espace organisateur.
 *
 * La session ET l'organisation active sont résolues ICI, une seule fois : une
 * page ajoutée demain à `/pro` hérite de la navigation et de la vérification
 * au lieu de risquer de les oublier (même raisonnement que
 * `(account)/layout.tsx`).
 *
 * ── Mobile ──────────────────────────────────────────────────────────────────
 * « Mobile pro : sidebar en tiroir, actions clés en barre basse. » Sous le
 * palier `md`, l'en-tête garde la marque, les alertes et le bouton du
 * tiroir. Le tiroir porte l'organisation active (et son sélecteur), toutes
 * les entrées, le passage à l'espace participant, le thème et la sortie. La
 * barre basse garde cinq destinations : tableau de bord, événements, scanner,
 * finances, équipe — ce qu'on ouvre le jour J, d'une main.
 */
export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?suite=/pro');

  const { organizations, active } = await resolveActiveOrganization();

  // Aucune organisation : le formulaire de création occupe tout l'écran, sans
  // chrome de console — il n'y a rien à naviguer tant qu'il n'y en a pas une.
  if (!active) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-6 px-5 py-12">
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-text-3">Espace organisateur</p>
          <h1 className="font-display text-h1 font-bold">Crée ton organisation</h1>
          <p className="text-body-l text-text-2">
            Un artiste indépendant et une agence utilisent la même entité, avec ou sans équipe. Tu
            pourras inviter des membres et te faire vérifier plus tard.
          </p>
        </div>

        <CreateOrganizationForm />
      </main>
    );
  }

  const feed = await fetchNotifications();

  const alertsLink = (
    <Link
      href="/mon-compte/notifications"
      aria-label={feed.unreadCount > 0 ? `Alertes, ${feed.unreadCount} non lues` : 'Alertes'}
      className="relative flex size-[var(--tap-min)] items-center justify-center rounded-full text-text-2 transition hover:bg-surface-alt hover:text-text-strong"
    >
      <Bell className="size-[18px]" />
      {feed.unreadCount > 0 ? (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 flex size-[7px] rounded-full bg-coral"
        />
      ) : null}
    </Link>
  );

  return (
    // `ToastProvider` ici plutôt que dans le layout racine : c'est le seul
    // endroit qui en a besoin pour l'instant (copier le lien d'invitation).
    <ToastProvider>
      <ConsoleShell
        brandHref="/pro"
        brandLabel="Espace organisateur"
        nav={<SectionNav entries={NAV_ENTRIES} ariaLabel="Espace organisateur" />}
        headerEnd={
          <>
            {/* Le sélecteur s'efface lui-même s'il n'y a qu'une organisation
                (voir `organization-switcher.tsx`) — mais alors plus rien
                n'affichait son nom nulle part dans le chrome. On le montre en
                texte simple dans ce cas : le cas le plus courant ne doit pas
                être celui qui perd l'identité de l'organisation. */}
            {/* Comme l'en-tête public : rien ne passe à la ligne, le palier
                décide. Nom de l'organisation et thème à partir de lg, prénom
                à partir de xl ; « Espace participant » n'est qu'une icône
                avant xl. */}
            {organizations.length > 1 ? (
              <div className="hidden lg:block">
                <OrganizationSwitcher organizations={organizations} activeId={active.id} />
              </div>
            ) : (
              <span className="hidden max-w-[220px] items-center gap-2 whitespace-nowrap text-body-s font-semibold text-text-strong lg:flex">
                <Avatar name={active.name} src={active.logoUrl} size="compact" />
                <span className="truncate">{active.name}</span>
              </span>
            )}

            {/* Sortie vers l'espace participant — jamais une déconnexion : on
                garde la session, on change juste de casquette. `/mon-compte`
                gère lui-même la redirection si l'utilisateur n'a pas encore de
                profil complet. */}
            <Link
              href="/mon-compte"
              aria-label="Espace participant"
              title="Espace participant"
              className="flex h-[36px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-field text-body-s font-semibold text-text-strong transition hover:bg-surface-alt w-[36px] xl:w-auto xl:px-3"
            >
              <UserRound className="size-4" />
              <span className="hidden xl:inline">Espace participant</span>
            </Link>

            <ThemeToggle className="hidden lg:inline-flex" />

            {alertsLink}

            <div className="flex shrink-0 items-center gap-2">
              <Avatar name={user.fullName} src={user.avatarUrl} size="compact" />
              <span className="hidden whitespace-nowrap text-body-s font-semibold text-text-strong xl:inline">
                {user.fullName.split(' ')[0]}
              </span>
            </div>

            <ProLogoutButton className="shrink-0 whitespace-nowrap" />
          </>
        }
        mobileHeaderEnd={alertsLink}
        mobileMenu={{
          title: 'Espace organisateur',
          dot: feed.unreadCount > 0,
          header: (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={active.name} src={active.logoUrl} size="default" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-bold text-text-strong">{active.name}</p>
                  <p className="truncate text-micro text-text-3">Compte · {user.fullName}</p>
                </div>
              </div>
              {organizations.length > 1 ? (
                <OrganizationSwitcher organizations={organizations} activeId={active.id} />
              ) : null}
            </div>
          ),
          footer: (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-s font-semibold text-text-2">Thème</span>
                <ThemeToggle />
              </div>
              <ProLogoutButton className="w-full justify-center rounded-button border border-border-field" />
            </>
          ),
          children: (
            <>
              <DrawerNavLink href="/pro" label="Tableau de bord" icon={<LayoutDashboard />} exact />
              <DrawerNavLink href="/pro/evenements" label="Événements" icon={<CalendarDays />} />
              <DrawerNavLink href="/pro/finances" label="Finances" icon={<Wallet />} />
              <DrawerNavLink href="/pro/equipe" label="Équipe" icon={<UsersRound />} />
              <DrawerNavLink href="/pro/parametres" label="Paramètres" icon={<Settings />} />
              <DrawerNavLink href="/pro/verification" label="Vérification" icon={<ShieldCheck />} />
              <DrawerNavLink href="/scan" label="Scanner les billets" icon={<ScanLine />} />

              <DrawerSection>Mon compte</DrawerSection>
              <DrawerNavLink
                href="/mon-compte/notifications"
                label="Alertes"
                icon={<Bell />}
                detail={feed.unreadCount > 0 ? `${feed.unreadCount} non lue${feed.unreadCount > 1 ? 's' : ''}` : undefined}
              />
              <DrawerNavLink
                href="/mon-compte"
                label="Espace participant"
                icon={<UserRound />}
                exact
                muted
              />
            </>
          ),
        }}
        mobileTabs={[
          { href: '/pro', label: 'Tableau', icon: <LayoutDashboard />, exact: true },
          { href: '/pro/evenements', label: 'Événements', icon: <CalendarDays /> },
          { href: '/scan', label: 'Scanner', icon: <ScanLine /> },
          { href: '/pro/finances', label: 'Finances', icon: <Wallet /> },
          { href: '/pro/equipe', label: 'Équipe', icon: <UsersRound /> },
        ]}
      >
        {children}
      </ConsoleShell>
    </ToastProvider>
  );
}
