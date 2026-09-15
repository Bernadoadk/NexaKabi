import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ORG_ROLE_DEFINITIONS, type OrgRole } from '@nexakabi/contracts';
import { formatPhone } from '@nexakabi/utils';
import { Avatar, Badge, Surface, SurfaceHeader, SurfaceSubtitle, SurfaceTitle } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { listMembers, resolveActiveOrganization } from '@/lib/organizations';
import { InviteMemberForm } from './invite-member-form';

export const metadata: Metadata = { title: 'Équipe & rôles' };

/**
 * Équipe et rôles (écran O13).
 *
 * Chaque rôle est décrit par une PHRASE compréhensible, jamais par une matrice
 * de cases à cocher : un organisateur indépendant ne doit pas avoir à
 * interpréter des permissions techniques.
 */
export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?suite=/pro/equipe');

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const members = await listMembers(active.id);
  const canInvite = active.role === 'OWNER' || active.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-h1 font-bold">Équipe &amp; rôles</h1>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <SurfaceHeader>
            <div>
              <SurfaceTitle>Membres de l’organisation</SurfaceTitle>
              <SurfaceSubtitle>
                {members.length} membre{members.length > 1 ? 's' : ''} · {active.name}
              </SurfaceSubtitle>
            </div>
          </SurfaceHeader>

          <ul>
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-3.5"
              >
                <Avatar name={member.fullName} src={member.avatarUrl} />

                <div className="min-w-0 flex-1">
                  <div className="text-body font-semibold">
                    {/* Un membre peut être actif sans avoir renseigné son nom :
                        son numéro tient alors lieu d'identité. Afficher
                        « invitation en attente » serait faux. */}
                    {member.fullName || formatPhone(member.phone, 'national')}
                    {member.isCurrentUser ? (
                      <span className="font-medium text-text-3"> · vous</span>
                    ) : null}
                  </div>
                  <div className="text-micro text-text-3">
                    {member.fullName ? formatPhone(member.phone) : 'Nom non renseigné'}
                  </div>
                </div>

                <div className="min-w-[190px] flex-1 text-body-s text-text-2">
                  {ORG_ROLE_DEFINITIONS[member.role].description}
                </div>

                <RoleBadge role={member.role} />

                <Badge tone={member.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {member.status === 'ACTIVE' ? 'Actif' : 'Invité'}
                </Badge>
              </li>
            ))}
          </ul>
        </Surface>

        <div className="flex flex-col gap-5">
          <Surface variant="ink" padding="comfortable" className="flex flex-col gap-4">
            <h2 className="text-[16px] font-bold">Quatre rôles, une phrase chacun</h2>

            <dl className="flex flex-col gap-3.5">
              {(['ADMIN', 'MANAGER', 'SCANNER', 'ANALYST'] as const).map((role) => (
                <div
                  key={role}
                  className="flex flex-col gap-1 border-b border-white/10 pb-3.5 last:border-0 last:pb-0"
                >
                  <dt className="text-body font-bold">{ORG_ROLE_DEFINITIONS[role].label}</dt>
                  <dd className="text-body-s leading-relaxed text-on-ink-2">
                    {ORG_ROLE_DEFINITIONS[role].description}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="rounded-[12px] bg-white/[0.07] p-3.5 text-body-s leading-relaxed text-on-ink-2">
              Le rôle est écrit en une phrase compréhensible, jamais sous forme de matrice de cases
              à cocher.
            </p>
          </Surface>

          {canInvite ? <InviteMemberForm organizationId={active.id} /> : null}
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: OrgRole }) {
  const tone =
    role === 'OWNER' || role === 'ADMIN'
      ? 'ink'
      : role === 'MANAGER'
        ? 'accent'
        : role === 'SCANNER'
          ? 'warning'
          : 'info';

  return <Badge tone={tone}>{ORG_ROLE_DEFINITIONS[role].label}</Badge>;
}
