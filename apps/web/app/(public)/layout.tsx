import Link from 'next/link';
import { CalendarPlus, LogIn, Search, UserRound } from 'lucide-react';
import { Avatar, Button, ThemeToggle, cn } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { fetchCities } from '@/lib/events';
import { fetchNotifications } from '@/lib/notifications';
import { PublicBottomNav } from '@/components/public-bottom-nav';
import { VilleSelect } from './ville-select';

/**
 * Cadre de l'espace public.
 *
 * ── Desktop ─────────────────────────────────────────────────────────────────
 * Un en-tête n'a pas le droit de passer à la ligne : chaque élément est
 * `shrink-0` + `whitespace-nowrap`, et c'est le palier qui décide ce qui
 * s'affiche — l'essentiel dès 768 px (Découvrir · Carte · Catégories · ville
 * · compte), le confort à 1024 (Ce week-end · thème · Aide · Organiser), le
 * complet à 1440 (Gratuit · recherche · libellé long). Conforme à la
 * navigation du prototype : logo · Découvrir · Catégories · Aide | recherche
 * | Organiser un événement · Connexion.
 *
 * ── Mobile ──────────────────────────────────────────────────────────────────
 * « Le mobile n'est pas une réduction du desktop. » L'en-tête ne garde que
 * la marque, la ville et l'entrée du compte ; la navigation passe en bas,
 * dans la barre à cinq onglets (`PublicBottomNav`), et la recherche vit dans
 * l'écran Découvrir. Aucun menu hamburger : les destinations réelles sont
 * peu nombreuses et doivent s'atteindre au pouce.
 *
 * Le dégagement du bas de page n'est réservé que lorsque la barre est là
 * (`has-[[data-bottom-tabs]]`) : sur la page événement, c'est la barre d'achat
 * qui prend sa place, avec son propre dégagement.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [user, cities] = await Promise.all([getCurrentUser(), fetchCities()]);
  const feed = user ? await fetchNotifications() : null;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── En-tête ──────────────────────────────────────────────────────────
          Rien ne passe à la ligne, jamais : chaque élément est \`shrink-0\` et
          \`whitespace-nowrap\`, et c'est le PALIER qui décide ce qui s'affiche.
            · md  (768)  logo · Découvrir · Carte · Catégories · ville · compte
            · lg  (1024) + Ce week-end · thème · Aide · Organiser (icône)
            · xl  (1440) + Gratuit · recherche · « Organiser mon événement »
          En dessous de md : logo · ville · compte, le reste vit dans la barre
          basse. */}
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[58px] max-w-[1440px] items-center gap-2.5 px-4 md:h-[66px] md:gap-3 md:px-5 lg:gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span className="flex size-6 items-center justify-center rounded-[8px] bg-coral font-display text-[14px] font-extrabold text-ink">
              N
            </span>
            <span className="font-display text-[18px] font-bold tracking-[-0.02em]">
              Nexa&#8209;Kabi
            </span>
          </Link>

          <nav
            className="ml-1 hidden shrink-0 items-center gap-4 text-body font-semibold md:flex lg:gap-5"
            aria-label="Découverte"
          >
            <HeaderLink href="/evenements" strong>
              Découvrir
            </HeaderLink>
            <HeaderLink href="/carte">Carte</HeaderLink>
            <HeaderLink href="/evenements#categorie">Catégories</HeaderLink>
            <HeaderLink href="/evenements?date=this_weekend" className="hidden lg:inline-flex">
              Ce week-end
            </HeaderLink>
            <HeaderLink href="/evenements?prix=gratuit" className="hidden xl:inline-flex">
              Gratuit
            </HeaderLink>
          </nav>

          <div className="flex-1" />

          <form action="/evenements" className="relative hidden w-[200px] shrink-0 xl:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
            <input
              type="search"
              name="q"
              placeholder="Rechercher…"
              aria-label="Rechercher un événement"
              className="min-h-[40px] w-full rounded-field border border-border-field bg-paper pl-9 pr-3 text-body-s"
            />
          </form>

          <ThemeToggle className="hidden shrink-0 lg:inline-flex" />

          {/* La ville : même pastille compacte à toutes les tailles — une
              épingle, le nom, un chevron ; le \`<select>\` natif est dessous. */}
          <VilleSelect cities={cities} compact />

          <Link
            href="/aide"
            className="hidden shrink-0 whitespace-nowrap text-body-s font-semibold text-text-2 hover:text-text-strong lg:inline-flex"
          >
            Aide
          </Link>

          {/* Point d'entrée unique pour un visiteur : « Connexion ». Organiser
              n'a de sens qu'une fois participant — le bouton de droite bascule
              lui-même entre Connexion et Mon compte. Entre lg et xl, le lien
              vers l'espace organisateur n'est qu'une icône : le libellé
              complet ne tient qu'à partir de 1440 px. */}
          {user ? (
            <Link
              href="/pro"
              aria-label="Organiser mon événement"
              title="Organiser mon événement"
              className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-field text-body-s font-semibold text-text-strong transition hover:bg-surface-alt lg:inline-flex lg:size-[40px] lg:justify-center xl:h-[40px] xl:w-auto xl:px-3.5"
            >
              <CalendarPlus className="size-4" />
              <span className="hidden xl:inline">Organiser mon événement</span>
            </Link>
          ) : null}

          {user ? (
            <>
              <Link
                href="/mon-compte"
                aria-label="Mon compte"
                className="flex size-[var(--tap-min)] shrink-0 items-center justify-center rounded-full md:hidden"
              >
                <Avatar name={user.fullName} src={user.avatarUrl} size="compact" />
              </Link>
              <Button
                asChild
                variant="secondary"
                size="compact"
                className="hidden shrink-0 whitespace-nowrap md:inline-flex"
              >
                <Link href="/mon-compte">
                  <UserRound className="size-4" />
                  Mon compte
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="ink" size="compact" className="shrink-0 whitespace-nowrap">
              <Link href="/connexion">
                <LogIn className="size-4" />
                Connexion
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col has-[[data-bottom-tabs]]:pb-[calc(env(safe-area-inset-bottom)+74px)] md:has-[[data-bottom-tabs]]:pb-0">
        <div className="flex-1">{children}</div>

        <footer className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-8 text-body-s text-text-2 sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} Nexa-Kabi · Cotonou, Bénin</p>
            <div className="flex-1" />
            <nav className="flex flex-wrap gap-4" aria-label="Informations légales">
              <Link href="/cgu" className="text-text-2 hover:text-text-strong">
                Conditions
              </Link>
              <Link href="/confidentialite" className="text-text-2 hover:text-text-strong">
                Confidentialité
              </Link>
              <Link href="/aide" className="text-text-2 hover:text-text-strong">
                Aide
              </Link>
              {user ? (
                <Link href="/pro" className="text-text-2 hover:text-text-strong">
                  Organiser un événement
                </Link>
              ) : null}
            </nav>
          </div>
        </footer>

        <PublicBottomNav signedIn={Boolean(user)} unreadCount={feed?.unreadCount ?? 0} />
      </div>
    </div>
  );
}

/** Lien de l'en-tête : jamais de retour à la ligne, actif en fort. */
function HeaderLink({
  href,
  strong = false,
  className,
  children,
}: {
  href: string;
  strong?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap transition-colors',
        strong ? 'text-text-strong hover:text-coral' : 'text-text-2 hover:text-text-strong',
        className,
      )}
    >
      {children}
    </Link>
  );
}
