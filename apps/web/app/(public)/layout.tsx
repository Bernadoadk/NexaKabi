import Link from 'next/link';
import { CalendarPlus, LogIn, Search, UserRound } from 'lucide-react';
import { Avatar, Button, ThemeToggle } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { fetchCities } from '@/lib/events';
import { fetchNotifications } from '@/lib/notifications';
import { PublicBottomNav } from '@/components/public-bottom-nav';
import { VilleSelect } from './ville-select';

/**
 * Cadre de l'espace public.
 *
 * ── Desktop ─────────────────────────────────────────────────────────────────
 * En-tête de 70 px : logo · Découvrir · Carte · Catégories · Ce week-end ·
 * Gratuit, puis recherche, thème, sélecteur de ville, aide, lien
 * professionnel et connexion — conforme à la navigation du prototype.
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
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[58px] max-w-[1440px] items-center gap-3 px-4 md:h-[70px] md:gap-4 md:px-5">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-[8px] bg-coral font-display text-[14px] font-extrabold text-ink">
              N
            </span>
            <span className="font-display text-[18px] font-bold tracking-[-0.02em]">
              Nexa&#8209;Kabi
            </span>
          </Link>

          <nav className="hidden gap-5 text-body font-semibold md:flex" aria-label="Découverte">
            <Link href="/evenements" className="text-text-strong hover:text-coral">
              Découvrir
            </Link>
            <Link href="/carte" className="text-text-2 hover:text-text-strong">
              Carte
            </Link>
            <Link href="/evenements#categorie" className="text-text-2 hover:text-text-strong">
              Catégories
            </Link>
            <Link
              href="/evenements?date=this_weekend"
              className="text-text-2 hover:text-text-strong"
            >
              Ce week-end
            </Link>
            <Link href="/evenements?prix=gratuit" className="text-text-2 hover:text-text-strong">
              Gratuit
            </Link>
          </nav>

          <form action="/evenements" className="relative hidden w-[220px] shrink-0 xl:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
            <input
              type="search"
              name="q"
              placeholder="Rechercher…"
              aria-label="Rechercher un événement"
              className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-paper pl-9 pr-3.5 text-body-s"
            />
          </form>

          <div className="flex-1" />

          {/* Mobile : la ville, compacte, juste avant le compte. */}
          <div className="md:hidden">
            <VilleSelect cities={cities} compact />
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <ThemeToggle />
            <VilleSelect cities={cities} />
            <Link
              href="/aide"
              className="text-body-s font-semibold text-text-2 hover:text-text-strong"
            >
              Aide
            </Link>
            {/* Point d'entrée unique pour un visiteur : « Connexion ». Organiser
                n'a de sens qu'une fois participant — voir le bouton de droite,
                qui bascule lui-même entre Connexion et Mon compte. */}
            {user ? (
              <Link
                href="/pro"
                className="inline-flex items-center gap-1.5 text-body-s font-semibold text-text-strong hover:text-coral"
              >
                <CalendarPlus className="size-4" />
                Organiser mon événement
              </Link>
            ) : null}
          </div>

          {user ? (
            <>
              <Link
                href="/mon-compte"
                aria-label="Mon compte"
                className="flex size-[var(--tap-min)] items-center justify-center rounded-full md:hidden"
              >
                <Avatar name={user.fullName} src={user.avatarUrl} size="compact" />
              </Link>
              <Button asChild variant="secondary" size="compact" className="hidden md:inline-flex">
                <Link href="/mon-compte">
                  <UserRound className="size-4" />
                  Mon compte
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="ink" size="compact">
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
