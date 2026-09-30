import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_PLATFORM_NOTIFICATION_SETTINGS,
  updatePlatformNotificationSettingsSchema,
  type PlatformNotificationSettings,
  type UpdatePlatformNotificationSettingsInput,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const NOTIFICATIONS_KEY = 'notifications';

/** Durée pendant laquelle une instance garde les réglages en mémoire. */
const CACHE_MS = 30_000;

/**
 * Interrupteurs globaux des envois, réglés depuis la console.
 *
 * ── Pourquoi un cache de trente secondes ────────────────────────────────────
 * Chaque notification consulte ces réglages avant de partir : une campagne de
 * rappels en lirait la ligne des centaines de fois pour la même réponse. Une
 * modification met donc au plus trente secondes à atteindre les autres
 * instances — sur l'instance qui l'enregistre, elle vaut tout de suite.
 *
 * ── Pourquoi on relit la valeur à travers le schéma ─────────────────────────
 * La colonne est du JSON : une valeur écrite par une ancienne version, ou à la
 * main, peut manquer d'un champ. Les défauts la complètent au lieu de laisser
 * passer un `undefined` qu'on lirait comme « coupé ».
 */
@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);

  private cached: { value: PlatformNotificationSettings; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getNotificationSettings(): Promise<PlatformNotificationSettings> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.value;
    }

    const row = await this.prisma.platformSetting.findUnique({
      where: { key: NOTIFICATIONS_KEY },
      select: { value: true },
    });

    const stored = updatePlatformNotificationSettingsSchema.safeParse(row?.value ?? {});
    const value: PlatformNotificationSettings = {
      ...DEFAULT_PLATFORM_NOTIFICATION_SETTINGS,
      ...(stored.success ? stripUndefined(stored.data) : {}),
    };

    this.cached = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  }

  async updateNotificationSettings(
    patch: UpdatePlatformNotificationSettingsInput,
    adminId: string,
  ): Promise<{ before: PlatformNotificationSettings; after: PlatformNotificationSettings }> {
    // Relire sans le cache : on enregistre à partir de la valeur réelle, pas
    // d'une copie qui peut avoir trente secondes de retard.
    this.cached = null;
    const before = await this.getNotificationSettings();
    const after: PlatformNotificationSettings = { ...before, ...stripUndefined(patch) };

    await this.prisma.platformSetting.upsert({
      where: { key: NOTIFICATIONS_KEY },
      create: {
        key: NOTIFICATIONS_KEY,
        value: after as unknown as Prisma.InputJsonValue,
        updatedById: adminId,
      },
      update: { value: after as unknown as Prisma.InputJsonValue, updatedById: adminId },
    });

    this.cached = { value: after, expiresAt: Date.now() + CACHE_MS };
    this.logger.log(`Réglages des envois modifiés : ${JSON.stringify(after)}`);

    return { before, after };
  }
}

/** Un champ absent du correctif ne doit pas écraser la valeur en place. */
function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
