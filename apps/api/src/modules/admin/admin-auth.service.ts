import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { buildTotpUri, generateTotpSecret, verifyTotp } from '@nexakabi/utils';
import type { AdminSession } from '@nexakabi/contracts';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  generateRecoveryCodes,
  hashPassword,
  normalizeRecoveryCode,
  verifyPassword,
} from './password';
import { decryptSecret, encryptSecret, needsEncryption } from './secret-box';

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
 * Authentification des administrateurs plateforme.
 *
 * ── Deux étapes, et la première n'ouvre rien ──────────────────────────────
 * Le mot de passe crée une session dont `totpVerifiedAt` est nul. Cette session
 * ne donne accès à AUCUNE donnée : le garde la refuse partout sauf sur la route
 * de validation du code. C'est la différence entre « deuxième facteur » et
 * « écran de confirmation » — dans le second cas, un mot de passe volé suffit à
 * qui sait ignorer l'écran.
 *
 * ── Ce qui est journalisé ─────────────────────────────────────────────────
 * Tout : connexions, échecs, validations TOTP, déconnexions. Un accès aux
 * pièces d'identité de tous les organisateurs se justifie a posteriori ou ne se
 * justifie pas.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  /**
   * Échecs de connexion : comptés EN BASE, pas en mémoire.
   *
   * ── Ce que la version en mémoire laissait passer ────────────────────────
   * Le compteur repartait de zéro à chaque redémarrage, et deux instances n'en
   * partageaient rien : le plafond de cinq tentatives devenait « cinq par
   * instance et par redémarrage ». Face à quelqu'un de patient, cela ne
   * plafonnait rien du tout.
   *
   * Le compteur vit désormais sur `AdminCredential`. Une écriture par échec est
   * négligeable — les échecs sont rares, et quand ils cessent de l'être, c'est
   * précisément le moment où il faut compter.
   */

  /** Clé de chiffrement des secrets TOTP. Ne vit jamais dans la base. */
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.encryptionKey = config.get('ADMIN_ENCRYPTION_KEY', { infer: true });
  }

  /**
   * Première étape : identifiants.
   *
   * ── Pourquoi un seul message d'erreur ────────────────────────────────────
   * « Cet e-mail n'existe pas » et « mot de passe incorrect » sont deux réponses
   * qui, mises bout à bout, énumèrent les administrateurs de la plateforme. Le
   * message est donc identique dans les deux cas.
   */
  async login(
    input: { email: string; password: string },
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<AdminSession> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: input.email.toLowerCase().trim(),
        deletedAt: null,
        status: { not: 'SUSPENDED' },
        globalRole: { in: ['ADMIN', 'SUPERADMIN', 'SUPPORT'] },
      },
      select: {
        id: true,
        fullName: true,
        globalRole: true,
        adminCredential: {
          select: {
            passwordHash: true,
            totpEnabledAt: true,
            totpSecret: true,
            failedAttempts: true,
            lockedUntil: true,
          },
        },
      },
    });

    const credential = user?.adminCredential;

    // Le blocage est vérifié APRÈS la lecture du compte, pour que la réponse
    // reste indiscernable de celle d'un identifiant inconnu : signaler « ce
    // compte est bloqué » confirmerait qu'il existe.
    if (credential) this.assertNotLockedOut(credential);

    // La vérification tourne MÊME quand le compte n'existe pas, contre une
    // empreinte factice : sans cela, la différence de durée entre « compte
    // inconnu » (immédiat) et « mot de passe faux » (100 ms) trahit l'existence
    // du compte, ce que le message unique cherchait justement à cacher.
    const matches = credential
      ? await verifyPassword(input.password, credential.passwordHash)
      : await this.burnTime(input.password);

    if (!user || !credential || !matches) {
      if (user) await this.recordFailure(user.id, credential?.failedAttempts ?? 0);
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    if (!credential.totpEnabledAt || !credential.totpSecret) {
      // Un compte sans TOTP ne peut pas se connecter. C'est volontaire : la
      // double authentification est une condition d'accès, pas une option qu'on
      // active plus tard.
      throw new UnauthorizedException(
        'La double authentification doit être configurée avant toute connexion. ' +
          'Contacte un autre administrateur.',
      );
    }

    await this.clearFailures(user.id);

    const { token, session } = await this.createSession(user.id, context);

    await this.audit.record({
      action: 'admin.login.password',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      changes: { ipAddress: context.ipAddress },
    });

    return {
      token,
      expiresAt: session.expiresAt.toISOString(),
      totpVerified: false,
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.globalRole as 'ADMIN' | 'SUPERADMIN' | 'SUPPORT',
      },
    };
  }

  /**
   * Seconde étape : code TOTP, ou code de secours.
   *
   * C'est cet appel — et lui seul — qui ouvre réellement la session.
   */
  async verifyTotpCode(token: string, code: string): Promise<AdminSession> {
    const session = await this.requireSession(token, { allowUnverified: true });

    if (session.totpVerifiedAt) {
      // Déjà validée : renvoyer l'état plutôt qu'une erreur. Un double clic ou
      // un rechargement ne doit pas ressembler à un échec.
      return this.describe(token, session);
    }

    const credential = await this.prisma.adminCredential.findUnique({
      where: { userId: session.user.id },
      select: {
        totpSecret: true,
        recoveryCodes: true,
        failedAttempts: true,
        lockedUntil: true,
      },
    });

    if (credential) this.assertNotLockedOut(credential);

    if (!credential?.totpSecret) {
      throw new UnauthorizedException('Double authentification non configurée.');
    }

    const secret = this.readSecret(session.user.id, credential.totpSecret);

    if (!secret) {
      // Chiffré avec une autre clé, ou altéré. Refuser vaut mieux que calculer
      // un code attendu sur des octets faux.
      throw new UnauthorizedException(
        'La double authentification de ce compte doit être reconfigurée. ' +
          'Contacte un autre administrateur.',
      );
    }

    const accepted =
      (await this.tryTotp(session.user.id, secret, code)) ||
      (await this.tryRecoveryCode(session.user.id, credential.recoveryCodes, code));

    if (!accepted) {
      await this.recordFailure(session.user.id, credential.failedAttempts);

      await this.audit.record({
        action: 'admin.login.totp_failed',
        entityType: 'User',
        entityId: session.user.id,
        actorUserId: session.user.id,
      });

      throw new UnauthorizedException('Code incorrect.');
    }

    await this.clearFailures(session.user.id);

    const updated = await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { totpVerifiedAt: new Date() },
      select: SESSION_SELECT.select,
    });

    await this.audit.record({
      action: 'admin.login.completed',
      entityType: 'User',
      entityId: session.user.id,
      actorUserId: session.user.id,
    });

    this.logger.log(`Connexion administrateur : ${session.user.id}`);

    return this.describe(token, updated);
  }

  /**
   * Résout une session à partir de son jeton.
   *
   * `allowUnverified` n'est vrai qu'à un seul endroit : la route de validation
   * du code. Partout ailleurs, une session sans TOTP est refusée.
   */
  async requireSession(
    token: string,
    options: { allowUnverified?: boolean } = {},
  ): Promise<SessionRow> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      ...SESSION_SELECT,
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expirée. Reconnecte-toi.');
    }

    if (!options.allowUnverified && !session.totpVerifiedAt) {
      throw new UnauthorizedException('Validation en deux étapes requise.');
    }

    // Trace de dernière activité, sans attendre : elle sert au suivi, pas à la
    // décision d'accès, et ne doit pas ralentir chaque requête.
    void this.prisma.adminSession
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return session;
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
   * Prépare la double authentification d'un compte.
   *
   * Renvoie le secret et l'URI à encoder en QR. Le secret n'est PAS encore
   * activé : `confirmTotpSetup` le fait, après une première validation réussie.
   * Enregistrer un secret que l'administrateur n'a pas réussi à scanner
   * l'enfermerait dehors.
   */
  async beginTotpSetup(
    userId: string,
  ): Promise<{ secret: string; uri: string; recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, phone: true },
    });

    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();

    await this.prisma.adminCredential.update({
      where: { userId },
      data: {
        totpSecret: encryptSecret(secret, this.encryptionKey),
        // Non activé tant que le premier code n'a pas été validé.
        totpEnabledAt: null,
        recoveryCodes: recoveryCodes.map((code) => hashRecoveryCode(code)),
      },
    });

    return {
      secret,
      uri: buildTotpUri({ secret, accountName: user.email ?? user.phone }),
      // En clair une seule fois. Ils sont hachés en base : personne ne pourra
      // les relire, y compris nous.
      recoveryCodes,
    };
  }

  /** Active la double authentification après une première validation. */
  async confirmTotpSetup(userId: string, code: string): Promise<void> {
    const credential = await this.prisma.adminCredential.findUniqueOrThrow({
      where: { userId },
      select: { totpSecret: true },
    });

    const secret = credential.totpSecret ? this.readSecret(userId, credential.totpSecret) : null;

    if (!secret || !verifyTotp(secret, code).valid) {
      throw new UnauthorizedException(
        'Ce code ne correspond pas. Vérifie l’heure de ton téléphone et réessaie.',
      );
    }

    await this.prisma.adminCredential.update({
      where: { userId },
      data: { totpEnabledAt: new Date() },
    });

    await this.audit.record({
      action: 'admin.totp.enabled',
      entityType: 'User',
      entityId: userId,
      actorUserId: userId,
    });
  }

  /** Crée un compte d'administration. Réservé à l'amorçage et aux superadmins. */
  async createAdmin(input: {
    userId: string;
    password: string;
  }): Promise<{ secret: string; uri: string; recoveryCodes: string[] }> {
    await this.prisma.adminCredential.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, passwordHash: await hashPassword(input.password) },
      update: {
        passwordHash: await hashPassword(input.password),
        lastPasswordChangeAt: new Date(),
      },
    });

    return this.beginTotpSetup(input.userId);
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
  ): Promise<{ token: string; session: SessionRow }> {
    const token = randomBytes(32).toString('base64url');

    const session = await this.prisma.adminSession.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent?.slice(0, 500),
      },
      ...SESSION_SELECT,
    });

    return { token, session };
  }

  private describe(token: string, session: SessionRow): AdminSession {
    return {
      token,
      expiresAt: session.expiresAt.toISOString(),
      totpVerified: session.totpVerifiedAt !== null,
      user: {
        id: session.user.id,
        fullName: session.user.fullName,
        role: session.user.globalRole as 'ADMIN' | 'SUPERADMIN' | 'SUPPORT',
      },
    };
  }

  /**
   * Vérifie un code TOTP et refuse son rejeu.
   *
   * ── Pourquoi le dernier pas vit en base ─────────────────────────────────
   * Un code TOTP reste valide quatre-vingt-dix secondes : intercepté puis
   * rejoué dans cette fenêtre, il ouvrirait une seconde session. Gardé en
   * mémoire, le garde-fou tombait à chaque redémarrage et ne couvrait qu'une
   * instance — c'est-à-dire qu'il disparaissait précisément le jour où l'API
   * passerait sur plusieurs machines, sans que rien ne le signale.
   *
   * L'écriture est conditionnelle : elle n'a lieu qu'à une connexion réussie,
   * soit quelques fois par jour et par administrateur.
   */
  private async tryTotp(userId: string, secret: string, code: string): Promise<boolean> {
    const result = verifyTotp(secret, code);

    if (!result.valid || result.step === null) return false;

    const credential = await this.prisma.adminCredential.findUnique({
      where: { userId },
      select: { lastTotpStep: true },
    });

    if (credential?.lastTotpStep === result.step) {
      this.logger.warn(`Rejeu de code TOTP refusé pour ${userId}`);
      return false;
    }

    await this.prisma.adminCredential.update({
      where: { userId },
      data: { lastTotpStep: result.step },
    });

    return true;
  }

  /**
   * Consomme un code de secours.
   *
   * À usage unique : il est retiré de la liste dès qu'il sert. Un code de
   * secours réutilisable ne serait qu'un second mot de passe, imprimé sur du
   * papier.
   */
  private async tryRecoveryCode(userId: string, hashes: string[], code: string): Promise<boolean> {
    const candidate = hashRecoveryCode(code);
    const index = hashes.findIndex((stored) => safeEquals(stored, candidate));

    if (index === -1) return false;

    const remaining = hashes.filter((_, position) => position !== index);

    await this.prisma.adminCredential.update({
      where: { userId },
      data: { recoveryCodes: remaining },
    });

    this.logger.warn(`Code de secours consommé par ${userId} — il en reste ${remaining.length}`);

    await this.audit.record({
      action: 'admin.recovery_code.used',
      entityType: 'User',
      entityId: userId,
      actorUserId: userId,
      changes: { remaining: remaining.length },
    });

    return true;
  }

  /**
   * Déchiffre un secret TOTP, et rattrape au passage les valeurs héritées.
   *
   * ── Migration sans interruption ─────────────────────────────────────────
   * Les secrets enregistrés avant ce correctif sont en clair. Les refuser
   * enfermerait dehors tous les administrateurs existants ; ils sont donc lus,
   * puis rechiffrés en tâche de fond à la première connexion réussie. Au bout
   * d'un cycle de connexions, plus rien n'est en clair.
   *
   * Le rechiffrement n'est pas attendu : il ne conditionne pas l'accès, et un
   * échec d'écriture ne doit pas empêcher quelqu'un de se connecter.
   */
  private readSecret(userId: string, stored: string): string | null {
    const secret = decryptSecret(stored, this.encryptionKey);

    if (secret && needsEncryption(stored)) {
      this.logger.warn(`Secret TOTP en clair rechiffré pour ${userId}`);

      void this.prisma.adminCredential
        .update({
          where: { userId },
          data: { totpSecret: encryptSecret(secret, this.encryptionKey) },
        })
        .catch(() => undefined);
    }

    return secret;
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

  /**
   * Consigne un échec et repousse la fenêtre de blocage.
   *
   * Le compteur repart de un quand le blocage précédent a expiré : c'est ce qui
   * distingue une série d'essais d'une faute de frappe isolée le mois dernier.
   */
  private async recordFailure(userId: string, current: number): Promise<void> {
    const credential = await this.prisma.adminCredential.findUnique({
      where: { userId },
      select: { lockedUntil: true },
    });

    const stillLocked = (credential?.lockedUntil?.getTime() ?? 0) > Date.now();

    await this.prisma.adminCredential
      .update({
        where: { userId },
        data: {
          failedAttempts: stillLocked ? current + 1 : 1,
          lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
        },
      })
      .catch(() => undefined);
  }

  private async clearFailures(userId: string): Promise<void> {
    await this.prisma.adminCredential
      .update({ where: { userId }, data: { failedAttempts: 0, lockedUntil: null } })
      .catch(() => undefined);
  }

  /**
   * Consomme le même temps qu'une vérification réelle.
   *
   * Le mot de passe fourni est haché contre un sel jeté : le résultat n'est
   * jamais lu, seule la DURÉE compte. Voir le commentaire dans `login`.
   */
  private async burnTime(password: string): Promise<false> {
    await verifyPassword(password, await hashPassword('emprunte-de-comparaison'));
    return false;
  }
}

const SESSION_SELECT = {
  select: {
    id: true,
    totpVerifiedAt: true,
    expiresAt: true,
    revokedAt: true,
    user: { select: { id: true, fullName: true, globalRole: true } },
  },
} as const;

export interface SessionRow {
  id: string;
  totpVerifiedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  user: { id: string; fullName: string; globalRole: string };
}

/** Le jeton n'est jamais stocké en clair : seule son empreinte l'est. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}
