import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Crown, UsersRound } from 'lucide-react';
import { ADMIN_ROLE_LABELS, type AdminStaffMember } from '@nexakabi/contracts';
import { formatRelative } from '@nexakabi/utils';
import { Alert, Avatar, Badge, EmptyState, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser } from '@/lib/session';
import { AdminShell } from '../shell';
import { describeAccess } from './access-summary';
import { CreateStaffButton, StaffActions } from './staff-actions';

export const metadata: Metadata = { title: 'Équipe' };

/**
 * L'équipe d'administration — écran du propriétaire.
 *
 * ── Ce qu'on y voit ───────────────────────────────────────────────────────
 * Chaque membre, son identifiant, ce qu'il peut faire (espace par espace),
 * son état et sa dernière connexion. Le propriétaire figure en tête, sans
 * action : il ne se modifie pas d'ici. Les employés portent leurs quatre
 * gestes : modifier, mot de passe, suspendre, supprimer.
 *
 * Un employé qui tape cette URL est renvoyé au tableau de bord : l'API lui
 * refuse la liste de toute façon.
 */
export default async function TeamPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'OWNER') redirect('/');

  const result = await adminFetch<AdminStaffMember[]>('/staff');
  const members = result.ok ? result.data : [];
  const owner = members.find((member) => member.role === 'OWNER');
  const staff = members.filter((member) => member.role === 'STAFF');

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Équipe</h1>
            <p className="max-w-[60ch] text-body-s text-text-2">
              Chaque employé n’a accès qu’aux espaces que tu lui ouvres, en consultation ou en
              décision. L’argent est un droit à part. Tout est tracé dans le journal d’audit.
            </p>
          </div>
          <CreateStaffButton />
        </header>

        {!result.ok ? (
          <Alert tone="danger" title="Équipe indisponible">
            {result.message}
          </Alert>
        ) : null}

        {owner ? (
          <Surface variant="ink" padding="default" className="flex flex-wrap items-center gap-3">
            <Avatar name={owner.fullName} size="default" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-body font-bold">
                <Crown className="size-4 text-coral-300" aria-hidden />
                {owner.fullName}
              </p>
              <p className="tabular truncate text-body-s text-on-ink-2">{owner.username}</p>
            </div>
            <div className="text-right text-micro text-on-ink-3">
              <p>{ADMIN_ROLE_LABELS.OWNER} · accès total</p>
              <p>
                {owner.lastLoginAt
                  ? `Connecté ${formatRelative(new Date(owner.lastLoginAt))}`
                  : 'Jamais connecté'}
              </p>
            </div>
          </Surface>
        ) : null}

        {staff.length === 0 ? (
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <EmptyState
              icon={<UsersRound size={26} />}
              title="Tu es seul pour l’instant"
              description="Ajoute un employé : tu choisis son identifiant, son mot de passe et les espaces qu’il peut voir ou où il peut décider."
            />
            <div className="flex justify-center border-t border-border-subtle px-6 py-5">
              <CreateStaffButton />
            </div>
          </Surface>
        ) : (
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <ul className="divide-y divide-border-subtle">
              {staff.map((member) => (
                <li key={member.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                  <div className="flex items-start gap-3">
                    <Avatar name={member.fullName} size="default" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-body font-bold text-text-strong">{member.fullName}</p>
                        {member.status === 'SUSPENDED' ? (
                          <Badge tone="danger" dot>
                            Suspendu
                          </Badge>
                        ) : (
                          <Badge tone="success">Actif</Badge>
                        )}
                        {member.canMoveMoney ? <Badge tone="warning">Argent</Badge> : null}
                      </div>
                      <p className="tabular text-body-s text-text-2">{member.username}</p>
                      <p className="mt-1 text-micro text-text-3">
                        {describeAccess(member.access, member.canMoveMoney)}
                        {' · '}
                        {member.lastLoginAt
                          ? `connecté ${formatRelative(new Date(member.lastLoginAt))}`
                          : 'jamais connecté'}
                      </p>
                    </div>
                  </div>

                  <div className="-mx-1 sm:pl-[52px]">
                    <StaffActions member={member} />
                  </div>
                </li>
              ))}
            </ul>
          </Surface>
        )}
      </div>
    </AdminShell>
  );
}
