import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AdminMe, AdminSession } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword, verifyPassword } from './password';
import { readPermissions } from './permissions';

/**
 * Durée d'une session d'administration.
 *
 * Huit heures — une journée de travail. La contrainte
 * `admin_session_is_short_lived` en base impose le même plafond : le code peut
 * être raccourci, jamais allongé sans une migration délibérée.
 */
const SESSION_HOURS = 8;

/** Délai avant qu'un échec répété bloque le compte. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Authentification de l'équipe d'administration.
 *
 * ── Une étape : identifiant et mot de passe ────────────────────────────────
 * La double authentification a été retirée à la demande du propriétaire. Ce
 * qui reste doit donc porter seul : mots de passe de douze caractères au
 * moins, hachés en scrypt ; blocage de quinze minutes après cinq échecs ;
 * jeton de session opaque, vérifié en base à chaque requête, révocable à
 * l'instant ; sessions coupées dès qu'un compte est suspendu ou supprimé.
 *
 * ── Ce qui est journalisé ─────────────────────────────────────────────────
 * Connexions, échecs, déconnexions, changements de mot de passe. Un accès aux
 * pièces d'identité de tous les organisateurs se justifie a posteriori ou ne
 * se justifie pas.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Connexion.
   *
   * ── Pourquoi un seul message d'erreur ────────────────────────────────────
   * « Cet identifiant n'existe pas » et « mot de passe incorrect » sont deux
   * réponses qui, mises bout à bout, énumèrent l'équipe. Le message est donc
   * identique dans les deux cas — et la vérification du mot de passe tourne
   * même quand le compte n'existe pas, pour que la durée ne trahisse rien.
   */
  async login(
    input: { username: string; password: string },
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<AdminSession> {
    const credential = await this.prisma.adminCredential.findUnique({
      where: { username: input.username.toLowerCase().trim() },
      select: {
        passwordHash: true,
        failedAttempts: true,
        lockedUntil: true,
        permissions: true,
        username: true,
        user: {
          select: { id: true, fullName: true, globalRole: true, status: true, deletedAt: true },
        },
      },
    });

    const user =
      credential &&
      credential.user.deletedAt === null &&
      credential.user.status !== 'SUSPENDED' &&
      (credential.user.globalRole === 'OWNER' || credential.user.globalRole === 'STAFF')
        ? credential.user
        : null;

    // Le blocage est vérifié APRÈS la lecture du compte, pour que la réponse
    // reste indiscernable de celle d'un identifiant inconnu : signaler « ce
    // compte est bloqué » confirmerait qu'il existe.
    if (credential) this.assertNotLockedOut(credential);

    const matches = credential
      ? await verifyPassword(input.password, credential.passwordHash)
      : await this.burnTime(input.password);

    if (!user || !credential || !matches) {
      if (credential && user) await this.recordFailure(user.id, credential.failedAttempts);
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    await this.prisma.adminCredential.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const { token, session } = await this.createSession(user.id, context);

    await this.audit.record({
      action: 'admin.login.completed',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      actorType: 'ADMIN',
      changes: { ipAddress: context.ipAddress },
    });

    this.logger.log(`Connexion administrateur : ${credential.username}`);

    return {
      token,
      expiresAt: session.expiresAt.toISOString(),
      user: describeAdmin({
        id: user.id,
        fullName: user.fullName,
        globalRole: user.globalRole,
        username: credential.username,
        permissions: credential.permissions,
      }),
    };
  }

  /** Résout une session à partir de son jeton ; refuse ce qui est expiré, révoqué ou suspendu. */
  async requireSession(token: string): Promise<AdminMe> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            globalRole: true,
            status: true,
            deletedAt: true,
            adminCredential: { select: { username: true, permissions: true } },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expirée. Reconnecte-toi.');
    }

    const { user } = session;

    // Un compte suspendu ou supprimé perd l'accès à la requête suivante, même
    // avec une session encore valide : c'est ce que « révocable » veut dire.
    if (
      user.deletedAt ||
      user.status === 'SUSPENDED' ||
      !user.adminCredential ||
      (user.globalRole !== 'OWNER' && user.globalRole !== 'STAFF')
    ) {
      throw new UnauthorizedException('Ce compte n’a plus accès à l’administration.');
    }

    // Trace de dernière activité, sans attendre : elle sert au suivi, pas à la
    // décision d'accès, et ne doit pas ralentir chaque requête.
    void this.prisma.adminSession
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return describeAdmin({
      id: user.id,
      fullName: user.fullName,
      globalRole: user.globalRole,
      username: user.adminCredential.username,
      permissions: user.adminCredential.permissions,
    });
  }

  async logout(token: string): Promise<void> {
    const hash = hashToken(token);

    // `updateMany` : une déconnexion sur un jeton déjà expiré ne doit pas lever.
    await this.prisma.adminSession.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Changement de son propre mot de passe.
   *
   * L'ancien est exigé : une session laissée ouverte sur un poste partagé ne
   * doit pas permettre de verrouiller le compte derrière soi. Les AUTRES
   * sessions du compte sont fermées : si le changement répond à un soupçon
   * de fuite, c'est précisément l'effet recherché.
   */
  async changePassword(
    userId: string,
    currentToken: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    const credential = await this.prisma.adminCredential.findUniqueOrThrow({
      where: { userId },
      select: { passwordHash: true },
    });

    if (!(await verifyPassword(input.currentPassword, credential.passwordHash))) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect.');
    }

    await this.prisma.$transaction([
      this.prisma.adminCredential.update({
        where: { userId },
        data: {
          passwordHash: await hashPassword(input.newPassword),
          lastPasswordChangeAt: new Date(),
        },
      }),
      this.prisma.adminSession.updateMany({
        where: { userId, revokedAt: null, tokenHash: { not: hashToken(currentToken) } },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'admin.password.changed',
      entityType: 'User',
      entityId: userId,
      actorUserId: userId,
      actorType: 'ADMIN',
    });
  }

  /** Ferme toutes les sessions d'un compte — suspension, suppression, réinitialisation. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Purge les sessions expirées. Appelée par le planificateur. */
  async purgeExpiredSessions(): Promise<number> {
    const { count } = await this.prisma.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    return count;
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  private async createSession(
    userId: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ token: string; session: { expiresAt: Date } }> {
    const token = randomBytes(32).toString('base64url');

    const session = await this.prisma.adminSession.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent?.slice(0, 500),
      },
      select: { expiresAt: true },
    });

    return { token, session };
  }

  private assertNotLockedOut(credential: {
    failedAttempts: number;
    lockedUntil: Date | null;
  }): void {
    const until = credential.lockedUntil?.getTime() ?? 0;

    if (credential.failedAttempts >= MAX_FAILED_ATTEMPTS && until > Date.now()) {
      const minutes = Math.ceil((until - Date.now()) / 60_000);

      throw new UnauthorizedException(
        `Trop de tentatives. Réessaie dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      );
    }
  }

  private async recordFailure(userId: string, previousFailures: number): Promise<void> {
    const failedAttempts = previousFailures + 1;
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
        : null;

    await this.prisma.adminCredential.update({
      where: { userId },
      data: { failedAttempts, lockedUntil },
    });

    if (lockedUntil) {
      this.logger.warn(`Compte d'administration bloqué ${LOCKOUT_MINUTES} min : ${userId}`);
    }
  }

  /**
   * Consomme le temps d'une vérification de mot de passe, sans compte.
   *
   * Sans cela, « identifiant inconnu » répondrait en une milliseconde et
   * « mot de passe faux » en cent : la différence suffit à énumérer l'équipe.
   */
  private async burnTime(password: string): Promise<false> {
    await verifyPassword(password, DUMMY_HASH);
    return false;
  }
}

/**
 * Empreinte factice, calculée une fois au démarrage : le coût d'une
 * vérification contre elle est celui d'une vraie.
 */
let DUMMY_HASH = '';
void hashPassword(randomBytes(24).toString('base64url')).then((hash) => {
  DUMMY_HASH = hash;
});

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparaison à temps constant, pour les rares endroits qui comparent des secrets. */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** L'administrateur tel que la console le lit — rôle et droits calculés. */
export function describeAdmin(row: {
  id: string;
  fullName: string;
  globalRole: 'USER' | 'OWNER' | 'STAFF';
  username: string;
  permissions: string[];
}): AdminMe {
  const role = row.globalRole === 'OWNER' ? 'OWNER' : 'STAFF';
  const { access, canMoveMoney } = readPermissions(row.permissions);

  return {
    id: row.id,
    fullName: row.fullName,
    username: row.username,
    role,
    access: role === 'OWNER' ? {} : access,
    canMoveMoney: role === 'OWNER' ? true : canMoveMoney,
  };
}
