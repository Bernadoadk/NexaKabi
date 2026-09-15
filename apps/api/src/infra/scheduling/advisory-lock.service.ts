import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Identifiants des verrous. Fixes et documentés : deux tâches qui partageraient
 * par accident le même nombre se bloqueraient mutuellement sans rien signaler.
 */
export const ADVISORY_LOCKS = {
  releaseExpiredOrders: 8_100_001,
  reconcilePayments: 8_100_002,
  sendReminders: 8_100_003,
  retryOutbound: 8_100_004,
  reconcilePayouts: 8_100_005,
} as const;

export type AdvisoryLockKey = (typeof ADVISORY_LOCKS)[keyof typeof ADVISORY_LOCKS];

/**
 * Verrou coopératif porté par PostgreSQL.
 *
 * Les tâches périodiques tournent dans le processus applicatif. Dès qu'il y a
 * deux instances, la même tâche se déclenche deux fois — deux balayages
 * d'expiration simultanés libéreraient les mêmes réservations en double.
 *
 * `pg_try_advisory_lock` règle le problème sans infrastructure supplémentaire :
 * une seule instance obtient le verrou, les autres passent leur tour. C'est le
 * choix retenu tant que la file BullMQ n'est pas en place ; la bascule ne
 * touchera que ce fichier et le planificateur.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §3 (Redis / BullMQ).
 */
@Injectable()
export class AdvisoryLockService {
  private readonly logger = new Logger(AdvisoryLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exécute `task` si le verrou est libre, sinon ne fait rien.
   *
   * @returns le résultat de la tâche, ou `null` si une autre instance l'exécutait.
   */
  async runExclusively<T>(key: AdvisoryLockKey, task: () => Promise<T>): Promise<T | null> {
    const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${key}::bigint) AS locked
    `;

    if (rows[0]?.locked !== true) {
      this.logger.debug(`Verrou ${key} déjà détenu — tâche ignorée sur cette instance`);
      return null;
    }

    try {
      return await task();
    } finally {
      // Toujours libérer, y compris après une erreur : un verrou consultatif
      // non relâché survit à la transaction et gèlerait la tâche pour de bon.
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`;
    }
  }
}
