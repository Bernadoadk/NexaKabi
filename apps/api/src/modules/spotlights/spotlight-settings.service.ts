import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_SPOTLIGHT_SETTINGS,
  updateSpotlightSettingsSchema,
  type SpotlightSettings,
  type UpdateSpotlightSettingsInput,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const SPOTLIGHTS_KEY = 'spotlights';

/** Durée pendant laquelle une instance garde les réglages en mémoire. */
const CACHE_MS = 30_000;

/**
 * Réglages de la une : nombre de diapositives, durée de chacune, mention
 * « Sponsorisé ».
 *
 * Même mécanique que les interrupteurs des envois (`PlatformSettingsService`) :
 * une ligne JSON de `platform_setting`, relue à travers le schéma pour qu'une
 * valeur incomplète retombe sur les défauts, et trente secondes de cache —
 * la une est lue à chaque revalidation du catalogue.
 */
@Injectable()
export class SpotlightSettingsService {
  private readonly logger = new Logger(SpotlightSettingsService.name);

  private cached: { value: SpotlightSettings; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SpotlightSettings> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.value;
    }

    const row = await this.prisma.platformSetting.findUnique({
      where: { key: SPOTLIGHTS_KEY },
      select: { value: true },
    });

    const stored = updateSpotlightSettingsSchema.safeParse(row?.value ?? {});
    const value: SpotlightSettings = {
      ...DEFAULT_SPOTLIGHT_SETTINGS,
      ...(stored.success ? stripUndefined(stored.data) : {}),
    };

    this.cached = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  }

  async update(
    patch: UpdateSpotlightSettingsInput,
    adminId: string,
  ): Promise<{ before: SpotlightSettings; after: SpotlightSettings }> {
    // Relire sans le cache : on enregistre à partir de la valeur réelle.
    this.cached = null;
    const before = await this.get();
    const after: SpotlightSettings = { ...before, ...stripUndefined(patch) };

    // Ce qu'un organisateur paie doit toujours tenir dans la une : jamais plus
    // de places vendables que de places affichées.
    if (after.paidSlotsPerDay > after.maxSlides) {
      throw new BadRequestException(
        `Les places vendables (${after.paidSlotsPerDay}) ne peuvent pas dépasser les places à la une (${after.maxSlides}).`,
      );
    }

    await this.prisma.platformSetting.upsert({
      where: { key: SPOTLIGHTS_KEY },
      create: {
        key: SPOTLIGHTS_KEY,
        value: after as unknown as Prisma.InputJsonValue,
        updatedById: adminId,
      },
      update: { value: after as unknown as Prisma.InputJsonValue, updatedById: adminId },
    });

    this.cached = { value: after, expiresAt: Date.now() + CACHE_MS };
    this.logger.log(`Réglages de la une modifiés : ${JSON.stringify(after)}`);

    return { before, after };
  }
}

/** Un champ absent du correctif ne doit pas écraser la valeur en place. */
function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
