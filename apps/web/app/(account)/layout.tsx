import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarPlus, LayoutDashboard } from 'lucide-react';
import { Avatar, BrandMark, ThemeToggle } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { listOrganizations } from '@/lib/organizations';
import { fetchNotifications } from '@/lib/notifications';
import { PublicBottomNav } from '@/components/public-bottom-nav';
import { AccountNav } from './account-nav';

/**
 * Espace participant.
 *
 * La session est vérifiée ICI, une seule fois, plutôt que dans chaque page :
 * une page ajoutée plus tard hérite de la protection au lieu de risquer de
 * l'oublier.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect('/connexion?suite=/mon-compte');
  if (user.needsProfileCompletion) redirect('/connexion');

  // En parallèle : ces deux appels ne dépendent pas l'un de l'autre, et
  // l'en-tête ne s'affiche qu'une fois les deux revenus.
  const [{ unreadCount }, organizations] = await Promise.all([
    fetchNotifications(),
    listOrganizations(),
  ]);

  const isOrganizer = organizations.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[58px] max-w-[960px] items-center justify-between px-4 sm:h-[62px] sm:px-5">
          <Link href="/" className="flex items-center gap-1.5">
            <BrandMark size={38} />
            {/* Masqué à l'œil sur mobile, mais toujours lu : sans lui, le lien
                n'aurait plus de nom pour un lecteur d'écran. */}
            <span className="sr-only font-display text-[17px] font-bold tracking-[-0.02em] sm:not-sr-only">
              Nexa&#8209;Kabi
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Passage vers l'espace organisateur — le symétrique exact du
                lien « Espace participant » de `(pro)/pro/layout.tsx`, même
                forme et même place : on garde la session, on change de
                casquette.

                ── Une seule destination pour deux libellés ──────────────────
                `/pro` sait déjà quoi faire dans les deux cas : sans
                organisation, son layout affiche le formulaire de création
                plein écran. Envoyer ailleurs le futur organisateur — une page
                d'accueil commerciale, par exemple — lui ferait franchir une
                étape de plus pour arriver au même formulaire.

                Le libellé, lui, doit distinguer les deux : « Espace
                organisateur » promet un endroit qui existe déjà, et le
                montrer à quelqu'un qui n'a rien créé le ferait douter d'avoir
                oublié quelque chose. */}
            <Link
              href="/pro"
              aria-label={isOrganizer ? 'Espace organisateur' : 'Devenir organisateur'}
              title={isOrganizer ? 'Espace organisateur' : 'Devenir organisateur'}
              className="flex h-[36px] w-[36px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-field text-body-s font-semibold text-text-strong transition hover:bg-surface-alt sm:w-auto sm:px-3"
            >
              {isOrganizer ? (
                <LayoutDashboard className="size-4" />
              ) : (
                <CalendarPlus className="size-4" />
              )}
              <span className="hidden sm:inline">
                {isOrganizer ? 'Espace organisateur' : 'Devenir organisateur'}
              </span>
            </Link>

            <ThemeToggle />
            <Link
              href="/mon-compte"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition hover:bg-surface-alt"
            >
              <Avatar name={user.fullName} src={user.avatarUrl} size="compact" />
              <span className="hidden text-body-s font-semibold text-text-strong sm:inline">
                {user.fullName.split(' ')[0]}
              </span>
            </Link>
          </div>
        </div>
        <AccountNav unreadCount={unreadCount} />
      </header>

      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-5 sm:px-5 sm:pt-6 md:pb-16">
        {children}
      </main>

      {/* La même barre basse que l'espace public : un participant passe de
          « Découvrir » à « Billets » sans changer d'application. */}
      <PublicBottomNav signedIn unreadCount={unreadCount} />
    </div>
  );
}
