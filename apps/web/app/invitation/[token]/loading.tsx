import { Skeleton } from '@nexakabi/ui';

/**
 * L'invitation d'équipe, pendant qu'elle se vérifie.
 *
 * Le lien arrive par WhatsApp et l'invité ne sait pas encore ce qu'on lui
 * propose — ni de qui, ni à quel titre. Le panneau est donc dessiné à sa forme
 * finale : surtitre, la phrase d'invitation sur deux lignes, l'encadré du rôle
 * et le bouton. Rien ne bougera quand le serveur aura répondu.
 */
export default function InvitationLoading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center gap-6 px-5 py-12">
      <div className="flex flex-col gap-5 rounded-panel border border-border bg-surface p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[9px] w-[130px]" />
          <Skeleton className="h-[25px] w-full" index={1} />
          <Skeleton className="h-[25px] w-[70%]" index={2} />
        </div>

        {/* L'encadré du rôle : fond papier, comme dans la page. */}
        <div className="flex flex-col gap-2 rounded-[12px] bg-paper p-4">
          <Skeleton className="h-[13px] w-[140px]" index={1} />
          <Skeleton className="h-[11px] w-full" index={2} />
          <Skeleton className="h-[11px] w-[60%]" index={3} />
        </div>

        <Skeleton className="h-[var(--tap-primary)] w-full rounded-button" index={2} />
        <Skeleton className="h-[9px] w-[85%]" index={3} />
      </div>
    </main>
  );
}
