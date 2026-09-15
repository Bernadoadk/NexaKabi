import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  ADMIN_SUFFIX_LENGTH,
  buildAdminUsername,
  type AdminRole,
  type AdminStaffMember,
  type CreateAdminStaffInput,
  type UpdateAdminStaffInput,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminAuthService } from './admin-auth.service';
import { hashPassword } from './password';
import { readPermissions, writePermissions } from './permissions';

/**
 * L'équipe d'administration, composée par le propriétaire.
 *
 * ── Ce qu'un employé est, techniquement ────────────────────────────────────
 * Un `User` de rôle `STAFF` — jamais participant, jamais organisateur — avec
 * un `AdminCredential` qui porte son identifiant, son mot de passe et ses
 * droits. Il ne se connecte pas par téléphone : le numéro provisoire posé à
 * la création n'existe que parce que le modèle l'exige.
 *
 * ── Ce que le propriétaire ne peut pas faire ───────────────────────────────
 * Se supprimer, se suspendre, se retirer ses droits : il n'y a qu'un
 * propriétaire, et la console doit rester accessible. Le transfert de
 * propriété n'existe pas encore ; il passera par un script, jamais par un
 * clic.
 *
 * Chaque geste est tracé nominativement : une équipe qui touche à l'argent
 * doit pouvoir dire qui a donné quel droit à qui, et quand.
 */

/** Alphabet sans caractères ambigus (ni 0/o, ni 1/l/i) : un suffixe se dicte à l'oral. */
const SUFFIX_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

const MEMBER_SELECT = {
  id: true,
  fullName: true,
  globalRole: true,
  status: true,
  createdAt: true,
  adminCredential: { select: { username: true, permissions: true, lastLoginAt: true } },
} as const;

type MemberRow = {
  id: string;
  fullName: string;
  globalRole: 'USER' | 'OWNER' | 'STAFF';
  status: string;
  createdAt: Date;
  adminCredential: { username: string; permissions: string[]; lastLoginAt: Date | null } | null;
};

@Injectable()
export class AdminStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AdminAuthService,
  ) {}

  /** Toute l'équipe, propriétaire compris — il figure en tête, non modifiable. */
  async list(): Promise<AdminStaffMember[]> {
    const rows = await this.prisma.user.findMany({
      where: { globalRole: { in: ['OWNER', 'STAFF'] }, deletedAt: null },
      select: MEMBER_SELECT,
      orderBy: [{ globalRole: 'asc' }, { createdAt: 'asc' }],
    });

    return rows
      .filter((row) => row.adminCredential !== null)
      .map((row) => toMember(row))
      .sort((a, b) => (a.role === b.role ? 0 : a.role === 'OWNER' ? -1 : 1));
  }

  async create(input: CreateAdminStaffInput, ownerId: string): Promise<AdminStaffMember> {
    const username = await this.uniqueUsername(input.handle, 'STAFF');

    const user = await this.prisma.user.create({
      data: {
        fullName: input.fullName,
        // Numéro provisoire, unique : le modèle `User` l'exige, alors qu'un
        // employé se connecte par identifiant et jamais par téléphone.
        phone: placeholderPhone(),
        globalRole: 'STAFF',
        status: 'ACTIVE',
        adminCredential: {
          create: {
            username,
            passwordHash: await hashPassword(input.password),
            permissions: writePermissions(input.access, input.canMoveMoney),
          },
        },
      },
      select: MEMBER_SELECT,
    });

    await this.audit.record({
      action: 'admin.staff.created',
      entityType: 'User',
      entityId: user.id,
      actorUserId: ownerId,
      actorType: 'ADMIN',
      changes: { username, access: input.access, canMoveMoney: input.canMoveMoney },
    });

    return toMember(user);
  }

  async update(
    id: string,
    input: UpdateAdminStaffInput,
    ownerId: string,
  ): Promise<AdminStaffMember> {
    const existing = await this.requireStaff(id);
    const before = readPermissions(existing.adminCredential?.permissions ?? []);

    const access = input.access ?? before.access;
    const canMoveMoney = input.canMoveMoney ?? before.canMoveMoney;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName,
        adminCredential: { update: { permissions: writePermissions(access, canMoveMoney) } },
      },
      select: MEMBER_SELECT,
    });

    await this.audit.record({
      action: 'admin.staff.updated',
      entityType: 'User',
      entityId: id,
      actorUserId: ownerId,
      actorType: 'ADMIN',
      changes: {
        before: { fullName: existing.fullName, ...before },
        after: { fullName: user.fullName, access, canMoveMoney },
      },
    });

    return toMember(user);
  }

  /**
   * Suspension ou réactivation.
   *
   * Suspendre ferme les sessions sur-le-champ : un employé qu'on écarte ne
   * doit pas garder huit heures d'accès sur un onglet resté ouvert.
   */
  async setStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
    ownerId: string,
  ): Promise<AdminStaffMember> {
    await this.requireStaff(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: MEMBER_SELECT,
    });

    if (status === 'SUSPENDED') await this.auth.revokeAllSessions(id);

    await this.audit.record({
      action: status === 'SUSPENDED' ? 'admin.staff.suspended' : 'admin.staff.reactivated',
      entityType: 'User',
      entityId: id,
      actorUserId: ownerId,
      actorType: 'ADMIN',
    });

    return toMember(user);
  }

  /**
   * Nouveau mot de passe, choisi par le propriétaire.
   *
   * Les sessions de l'employé sont fermées : s'il a perdu son mot de passe,
   * quelqu'un d'autre l'a peut-être trouvé.
   */
  async resetPassword(id: string, password: string, ownerId: string): Promise<void> {
    await this.requireStaff(id);

    await this.prisma.adminCredential.update({
      where: { userId: id },
      data: {
        passwordHash: await hashPassword(password),
        lastPasswordChangeAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.auth.revokeAllSessions(id);

    await this.audit.record({
      action: 'admin.staff.password_reset',
      entityType: 'User',
      entityId: id,
      actorUserId: ownerId,
      actorType: 'ADMIN',
    });
  }

  /**
   * Suppression — logique.
   *
   * Le compte perd son rôle, ses sessions et son identifiant (libéré pour un
   * éventuel homonyme), mais la ligne reste : le journal d'audit continue de
   * pointer vers quelqu'un.
   */
  async remove(id: string, ownerId: string): Promise<void> {
    const existing = await this.requireStaff(id);

    await this.prisma.$transaction([
      this.prisma.adminCredential.delete({ where: { userId: id } }),
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'DELETED' },
      }),
    ]);

    await this.auth.revokeAllSessions(id);

    await this.audit.record({
      action: 'admin.staff.deleted',
      entityType: 'User',
      entityId: id,
      actorUserId: ownerId,
      actorType: 'ADMIN',
      changes: { username: existing.adminCredential?.username, fullName: existing.fullName },
    });
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  /** Un employé existant — jamais le propriétaire, jamais un compte supprimé. */
  private async requireStaff(id: string): Promise<MemberRow> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, globalRole: { in: ['OWNER', 'STAFF'] } },
      select: MEMBER_SELECT,
    });

    if (!user || !user.adminCredential) {
      throw new NotFoundException('Ce membre de l’équipe n’existe pas.');
    }

    if (user.globalRole === 'OWNER') {
      throw new ForbiddenException('Le propriétaire ne se modifie pas depuis cet écran.');
    }

    return user;
  }

  /** `nom.staff@7k2p`, avec un suffixe tiré au hasard jusqu'à trouver libre. */
  async uniqueUsername(handle: string, role: AdminRole): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = buildAdminUsername(handle, role, randomSuffix());
      const taken = await this.prisma.adminCredential.findUnique({
        where: { username: candidate },
        select: { id: true },
      });

      if (!taken) return candidate;
    }

    throw new ConflictException('Impossible de générer un identifiant libre. Réessaie.');
  }
}

export function randomSuffix(): string {
  let suffix = '';
  for (let index = 0; index < ADMIN_SUFFIX_LENGTH; index += 1) {
    suffix += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

/**
 * Numéro E.164 factice, unique, pour un compte d'équipe.
 *
 * Il doit passer la normalisation (dix chiffres commençant par « 01 ») sans
 * pouvoir appartenir à quelqu'un : « 00 » n'est le préfixe d'aucun opérateur
 * après le « 01 » du plan de numérotation. Horodatage plus aléa : deux
 * créations dans la même milliseconde ne se heurtent pas.
 */
export function placeholderPhone(): string {
  return `+2290100${Date.now().toString().slice(-5)}${randomInt(10)}`;
}

function toMember(row: MemberRow): AdminStaffMember {
  if (!row.adminCredential) {
    throw new BadRequestException('Ce compte n’a pas d’identifiant d’administration.');
  }

  const role: AdminRole = row.globalRole === 'OWNER' ? 'OWNER' : 'STAFF';
  const { access, canMoveMoney } = readPermissions(row.adminCredential.permissions);

  return {
    id: row.id,
    fullName: row.fullName,
    username: row.adminCredential.username,
    role,
    status: row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    access: role === 'OWNER' ? {} : access,
    canMoveMoney: role === 'OWNER' ? true : canMoveMoney,
    lastLoginAt: row.adminCredential.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
