import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ADMIN_ROLE_LABELS } from '@nexakabi/contracts';
import { Surface } from '@nexakabi/ui';
import { getAdminUser } from '@/lib/session';
import { AdminShell } from '../shell';
import { describeAccess } from '../equipe/access-summary';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Mon compte' };

/**
 * Son propre compte : identifiant, droits, mot de passe.
 *
 * Le seul geste possible ici est de changer son mot de passe — en donnant
 * l'ancien. Les droits se lisent, ils ne se demandent pas : c'est au
 * propriétaire de les accorder, depuis l'écran Équipe.
 */
export default async function AccountPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');

  return (
    <AdminShell user={user}>
      <div className="flex max-w-[640px] flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Mon compte</h1>
          <p className="text-body-s text-text-2">{ADMIN_ROLE_LABELS[user.role]}</p>
        </header>

        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
          <div>
            <p className="text-micro text-text-3">Identifiant</p>
            <p className="tabular font-display text-[17px] font-bold text-text-strong">
              {user.username}
            </p>
          </div>
          <div>
            <p className="text-micro text-text-3">Droits</p>
            <p className="text-body-s text-text-2">
              {user.role === 'OWNER'
                ? 'Accès total, composition de l’équipe.'
                : describeAccess(user.access, user.canMoveMoney)}
            </p>
          </div>
        </Surface>

        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 font-bold">Changer mon mot de passe</h2>
            <p className="text-body-s text-text-2">
              Douze caractères au minimum. Tes autres sessions seront fermées.
            </p>
          </div>
          <PasswordForm />
        </Surface>
      </div>
    </AdminShell>
  );
}
