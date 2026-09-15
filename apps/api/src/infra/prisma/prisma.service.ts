import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { Env } from '../../config/env';

/**
 * Client Prisma géré par le conteneur NestJS.
 *
 * Depuis Prisma 7, la connexion passe par un driver adapter explicite plutôt
 * que par une URL déclarée dans le schéma.
 *
 * Aucun service métier n'utilise ce client directement : tout passe par un
 * repository. Cela isole le choix de l'ORM et rend les tests unitaires
 * possibles sans base de données.
 * Voir docs/TECHNICAL_ARCHITECTURE.md §4.3.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        /**
         * Une vente flash sérialise des centaines d'acheteurs sur la même
         * catégorie de billet : chacun attend son tour derrière un
         * `SELECT … FOR UPDATE`. Avec le pool par défaut de node-postgres —
         * dix connexions — la file se forme au mauvais endroit, et les demandes
         * sont refusées faute de connexion alors que les places existent.
         */
        max: 25,
        /** Une connexion inactive est rendue plutôt que gardée pour rien. */
        idleTimeoutMillis: 30_000,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connexion à PostgreSQL établie');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Vérifie que la base répond. Utilisé par la sonde de disponibilité. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('PostgreSQL injoignable', error);
      return false;
    }
  }
}
