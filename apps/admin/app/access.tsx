import Link from 'next/link';
import { Eye, Lock } from 'lucide-react';
import { ADMIN_SPACES, type AdminSpace } from '@nexakabi/contracts';
import { Alert, Button, EmptyState, Surface } from '@nexakabi/ui';
import type { AdminUser } from '@/lib/session';
import { AdminShell } from './shell';

/**
 * Ce qu'un employé voit quand un espace lui est fermé.
 *
 * Une URL tapée à la main, un lien reçu d'un collègue : la page répond, sans
 * rien montrer, et dit à qui demander. L'API aurait refusé de toute façon ;
 * l'écran évite que le refus ressemble à une panne.
 */
export function AccessDenied({ user, space }: { user: AdminUser; space: AdminSpace }) {
  const label = ADMIN_SPACES.find((entry) => entry.key === space)?.label ?? space;

  return (
    <AdminShell user={user}>
      <Surface variant="panel" padding="none" className="overflow-hidden">
        <EmptyState
          icon={<Lock size={26} />}
          title={`Tu n’as pas accès à « ${label} »`}
          description="Cet espace n’est pas dans tes droits. Le propriétaire de la plateforme peut te l’ouvrir depuis l’écran Équipe."
        />
        <div className="flex justify-center border-t border-border-subtle px-6 py-5">
          <Button asChild variant="secondary" size="compact">
            <Link href="/">Retour au tableau de bord</Link>
          </Button>
        </div>
      </Surface>
    </AdminShell>
  );
}

/** À la place d'un bouton de décision, pour qui ne peut que consulter. */
export function ReadOnlyNotice({ what = 'décider ici' }: { what?: string }) {
  return (
    <Alert tone="info" title="Consultation seule">
      <span className="inline-flex items-start gap-1.5">
        <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>Ton compte peut lire cet espace, pas {what}. Demande ce droit au propriétaire.</span>
      </span>
    </Alert>
  );
}
