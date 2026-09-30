import { BadRequestException, Injectable } from '@nestjs/common';
import type { UserInterests } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Goûts du participant : les catégories qui l'intéressent, les villes où il sort.
 *
 * Ils servent à UNE chose : composer la sélection « Pour toi », et la
 * sélection hebdomadaire qu'il a demandée. Rien d'autre ne les lit — ni le
 * catalogue, ni l'ordre des résultats, ni aucun organisateur.
 */
@Injectable()
export class InterestsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserInterests> {
    const [categories, cities] = await Promise.all([
      this.prisma.userCategoryInterest.findMany({
        where: { userId },
        select: { categoryId: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.userCityInterest.findMany({
        where: { userId },
        select: { cityId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      categoryIds: categories.map((row) => row.categoryId),
      cityIds: cities.map((row) => row.cityId),
    };
  }

  /**
   * Remplace les goûts d'un bloc.
   *
   * Seules les catégories et villes ACTIVES sont acceptées : une catégorie
   * retirée du référentiel ne doit pas continuer à filtrer une sélection en
   * silence. Un identifiant inconnu est une erreur de l'écran, pas un choix
   * du participant — on le refuse plutôt que de l'ignorer.
   */
  async set(userId: string, input: UserInterests): Promise<UserInterests> {
    const categoryIds = [...new Set(input.categoryIds)];
    const cityIds = [...new Set(input.cityIds)];

    const [categories, cities] = await Promise.all([
      categoryIds.length > 0
        ? this.prisma.category.count({
            where: { id: { in: categoryIds }, isActive: true, parentId: null },
          })
        : 0,
      cityIds.length > 0
        ? this.prisma.city.count({ where: { id: { in: cityIds }, isActive: true } })
        : 0,
    ]);

    if (categories !== categoryIds.length || cities !== cityIds.length) {
      throw new BadRequestException(
        'Une des catégories ou des villes choisies n’existe plus. Recharge la page et réessaie.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.userCategoryInterest.deleteMany({ where: { userId } }),
      this.prisma.userCityInterest.deleteMany({ where: { userId } }),
      this.prisma.userCategoryInterest.createMany({
        data: categoryIds.map((categoryId) => ({ userId, categoryId })),
      }),
      this.prisma.userCityInterest.createMany({
        data: cityIds.map((cityId) => ({ userId, cityId })),
      }),
    ]);

    return { categoryIds, cityIds };
  }
}
