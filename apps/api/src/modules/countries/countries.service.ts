import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_COUNTRY_CODE,
  KNOWN_COUNTRIES,
  type Country,
  type UpdateCountryInput,
} from '@nexakabi/contracts';
import { resolveCurrency, tryNormalizePhoneForCountry } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Country as CountryRow } from '../../generated/prisma/client';

/**
 * Pays.
 *
 * ── Ce que « pays » veut dire ici ───────────────────────────────────────────
 * Une donnée de configuration, pas une constante. Le pays fixe la devise, les
 * règles de numéro de téléphone, et — par le routage des paiements — les
 * moyens de collecte et de versement ouverts. Le Bénin est le pays par
 * défaut ; il n'est plus le seul possible.
 *
 * Trois pays interviennent dans une vente, et ils peuvent différer :
 *   · le pays de l'ÉVÉNEMENT — fixe la devise et les moyens de paiement du
 *     tunnel ; c'est le « pays de paiement » d'une commande ;
 *   · le pays de l'ORGANISATION — fixe la devise de son grand livre et les
 *     moyens de réception de ses retraits ;
 *   · le pays du PAYEUR — connu par son numéro, il n'a pas à être celui de
 *     l'événement : un Sénégalais peut payer un concert à Cotonou.
 */
@Injectable()
export class CountriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pays ouverts, dans l'ordre d'affichage. */
  async listActive(): Promise<Country[]> {
    const rows = await this.prisma.country.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return rows.map(toCountry);
  }

  /** Tous les pays connus, ouverts ou non — pour la console. */
  async listAll(): Promise<Country[]> {
    const rows = await this.prisma.country.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return rows.map(toCountry);
  }

  /**
   * Pays par défaut de la plateforme.
   *
   * L'index unique partiel garantit qu'il y en a au plus un ; s'il n'y en a
   * aucun — base amorcée à la main —, le Bénin tient le rôle, comme avant.
   */
  async getDefault(): Promise<Country> {
    const row =
      (await this.prisma.country.findFirst({ where: { isDefault: true } })) ??
      (await this.prisma.country.findUnique({ where: { code: DEFAULT_COUNTRY_CODE } }));

    if (!row) {
      throw new NotFoundException('Aucun pays par défaut n’est configuré.');
    }

    return toCountry(row);
  }

  /** Un pays par son code, ouvert ou non. */
  async find(code: string): Promise<Country | null> {
    const row = await this.prisma.country.findUnique({ where: { code: code.toUpperCase() } });
    return row ? toCountry(row) : null;
  }

  /** Un pays OUVERT, ou une erreur qui dit pourquoi. */
  async requireActive(code: string): Promise<Country> {
    const country = await this.find(code);

    if (!country) {
      throw new BadRequestException(`Le pays ${code} est inconnu.`);
    }

    if (!country.isActive) {
      throw new BadRequestException(
        `${country.name} n’est pas encore ouvert sur Nexa-Kabi. Les organisateurs de ce pays pourront s’inscrire dès son ouverture.`,
      );
    }

    return country;
  }

  /**
   * Normalise un numéro pour un pays, avec le message que l'écran affichera.
   *
   * Le numéro d'un payeur Mobile Money ou d'un compte de réception appartient
   * au pays où l'argent circule : sa règle est celle de CE pays, pas celle de
   * l'identifiant de connexion.
   */
  normalizePhone(input: string, country: Pick<Country, 'code' | 'name' | 'dialCode'>): string {
    const normalized = tryNormalizePhoneForCountry(input, country.code);

    if (!normalized) {
      throw new BadRequestException(
        `Ce numéro n’est pas un numéro valide pour ${country.name} (+${country.dialCode}).`,
      );
    }

    return normalized;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Administration
  // ───────────────────────────────────────────────────────────────────────────

  async update(code: string, input: UpdateCountryInput): Promise<Country> {
    const existing = await this.prisma.country.findUnique({ where: { code: code.toUpperCase() } });

    if (!existing) {
      throw new NotFoundException(`Le pays ${code} est inconnu.`);
    }

    const willBeActive = input.isActive ?? existing.isActive;

    if (existing.isDefault && input.isActive === false) {
      throw new BadRequestException(
        'Le pays par défaut ne peut pas être fermé. Désigne d’abord un autre pays par défaut.',
      );
    }

    if (input.isDefault === true && !willBeActive) {
      throw new BadRequestException('Le pays par défaut doit être ouvert.');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        // Un seul pays par défaut : l'index partiel le garantit, mais autant
        // ne pas se heurter à lui — on retire l'ancien dans la même transaction.
        await tx.country.updateMany({
          where: { isDefault: true, NOT: { code: existing.code } },
          data: { isDefault: false },
        });
      }

      return tx.country.update({
        where: { code: existing.code },
        data: {
          isActive: input.isActive,
          isDefault: input.isDefault,
          position: input.position,
        },
      });
    });

    return toCountry(row);
  }

  /**
   * S'assure que tous les pays connus existent en base — idempotent.
   *
   * La migration initiale les amorce ; ceci rattrape un pays ajouté au
   * catalogue après coup, sans migration, fermé par défaut.
   */
  async ensureKnownCountries(): Promise<number> {
    let created = 0;

    for (const [index, known] of KNOWN_COUNTRIES.entries()) {
      const result = await this.prisma.country.upsert({
        where: { code: known.code },
        create: { ...known, isActive: false, isDefault: false, position: index * 10 },
        update: {},
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
    }

    return created;
  }
}

export function toCountry(row: CountryRow): Country {
  return {
    code: row.code,
    name: row.name,
    currency: resolveCurrency(row.currency).code,
    dialCode: row.dialCode,
    flag: row.flag,
    isActive: row.isActive,
    isDefault: row.isDefault,
    position: row.position,
  };
}
