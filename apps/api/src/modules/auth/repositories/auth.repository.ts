import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { Device, OtpChallenge, User } from '../../../generated/prisma/client';

export interface CreateOtpChallengeInput {
  phone: string;
  codeHash: string;
  channel: 'SMS' | 'WHATSAPP';
  expiresAt: Date;
  ipAddress?: string;
}

export interface CreateDeviceInput {
  userId: string;
  refreshTokenHash: string;
  tokenFamily: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  label?: string;
}

/**
 * Seule couche qui parle à Prisma pour l'authentification.
 *
 * Les services d'authentification n'appellent jamais Prisma directement :
 * cela isole le choix de l'ORM et rend les tests possibles sans base de données.
 * Voir docs/TECHNICAL_ARCHITECTURE.md §4.3.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Codes à usage unique ──────────────────────────────────────────────────

  createOtpChallenge(input: CreateOtpChallengeInput): Promise<OtpChallenge> {
    return this.prisma.otpChallenge.create({
      data: {
        phone: input.phone,
        codeHash: input.codeHash,
        channel: input.channel,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress,
      },
    });
  }

  /** Défi actif le plus récent pour ce numéro. */
  findActiveChallenge(phone: string, now: Date): Promise<OtpChallenge | null> {
    return this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Demandes émises pendant la fenêtre de limitation. */
  countRecentChallenges(phone: string, since: Date): Promise<number> {
    return this.prisma.otpChallenge.count({
      where: { phone, createdAt: { gte: since } },
    });
  }

  findLastChallenge(phone: string): Promise<OtpChallenge | null> {
    return this.prisma.otpChallenge.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
  }

  incrementChallengeAttempts(id: string): Promise<OtpChallenge> {
    return this.prisma.otpChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  consumeChallenge(id: string, now: Date): Promise<OtpChallenge> {
    return this.prisma.otpChallenge.update({
      where: { id },
      data: { consumedAt: now },
    });
  }

  /** Invalide les défis en cours : un nouveau code annule les précédents. */
  async invalidateChallenges(phone: string, now: Date): Promise<void> {
    await this.prisma.otpChallenge.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: now },
    });
  }

  async purgeExpiredChallenges(now: Date): Promise<number> {
    const { count } = await this.prisma.otpChallenge.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return count;
  }

  // ── Utilisateurs ──────────────────────────────────────────────────────────

  findUserByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { phone, deletedAt: null } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  createUser(phone: string, now: Date): Promise<User> {
    return this.prisma.user.create({
      data: {
        phone,
        // Le nom est renseigné à l'étape 3, ou par les coordonnées d'un achat.
        fullName: '',
        status: 'ACTIVE',
        phoneVerifiedAt: now,
      },
    });
  }

  markPhoneVerified(userId: string, now: Date): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { phoneVerifiedAt: now, status: 'ACTIVE', lastSeenAt: now },
    });
  }

  touchLastSeen(userId: string, now: Date): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: now },
    });
  }

  updateProfile(
    userId: string,
    data: {
      fullName?: string;
      email?: string | null;
      marketingOptIn?: boolean;
      avatarUrl?: string | null;
      termsAcceptedAt?: Date;
    },
  ): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  // ── Appareils ─────────────────────────────────────────────────────────────

  createDevice(input: CreateDeviceInput): Promise<Device> {
    return this.prisma.device.create({ data: input });
  }

  findDeviceByRefreshHash(hash: string): Promise<(Device & { user: User }) | null> {
    return this.prisma.device.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });
  }

  findDeviceById(id: string): Promise<Device | null> {
    return this.prisma.device.findUnique({ where: { id } });
  }

  /**
   * Rotation d'un jeton de rafraîchissement.
   *
   * L'ancien appareil est RÉVOQUÉ et un nouveau prend sa place dans la même
   * lignée. Remplacer le hachage en place serait plus simple mais ruinerait la
   * détection de vol : l'ancien jeton deviendrait introuvable au lieu d'être
   * reconnu comme révoqué, et un rejeu passerait pour une simple session
   * expirée. C'est la raison d'être du champ `tokenFamily`.
   */
  rotateDevice(previous: Device, refreshTokenHash: string, now: Date): Promise<Device> {
    return this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: previous.id },
        data: { revokedAt: now, lastUsedAt: now },
      });

      return tx.device.create({
        data: {
          userId: previous.userId,
          refreshTokenHash,
          tokenFamily: previous.tokenFamily,
          expiresAt: previous.expiresAt,
          userAgent: previous.userAgent,
          ipAddress: previous.ipAddress,
          label: previous.label,
          lastUsedAt: now,
        },
      });
    });
  }

  revokeDevice(id: string, now: Date): Promise<Device> {
    return this.prisma.device.update({ where: { id }, data: { revokedAt: now } });
  }

  /** Révoque toute une lignée : réaction à la réutilisation d'un jeton consommé. */
  async revokeTokenFamily(tokenFamily: string, now: Date): Promise<number> {
    const { count } = await this.prisma.device.updateMany({
      where: { tokenFamily, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  async revokeAllUserDevices(userId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.device.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  listActiveDevices(userId: string, now: Date): Promise<Device[]> {
    return this.prisma.device.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }
}
