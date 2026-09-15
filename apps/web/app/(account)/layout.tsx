import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar, ThemeToggle } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
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

  const { unreadCount } = await fetchNotifications();

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[58px] max-w-[960px] items-center justify-between px-4 sm:h-[62px] sm:px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-[9px] bg-coral font-display text-[15px] font-extrabold text-ink">
              N
            </span>
            <span className="hidden font-display text-[17px] font-bold tracking-[-0.02em] sm:inline">
              Nexa&#8209;Kabi
            </span>
          </Link>

          <div className="flex items-center gap-3">
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
