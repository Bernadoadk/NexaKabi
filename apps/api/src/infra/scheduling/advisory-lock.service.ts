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
  reconcileRefunds: 8_100_006,
} as const;

export type AdvisoryLockKey = (typeof ADVISORY_LOCKS)[keyof typeof ADVISORY_LOCKS];

/**
 * Durée maximale d'une tâche sous verrou.
 *
 * Le verrou vit le temps d'une transaction ouverte à côté de la tâche ; au-delà
 * de ce délai, la transaction est abandonnée et le verrou libéré. Aucune tâche
 * périodique n'approche ce temps — une plateforme serverless l'aurait coupée
 * bien avant.
 */
const LOCK_TRANSACTION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Verrou coopératif porté par PostgreSQL.
 *
 * Les tâches périodiques tournent dans le processus applicatif. Dès qu'il y a
 * deux instances, la même tâche se déclenche deux fois — deux balayages
 * d'expiration simultanés libéreraient les mêmes réservations en double.
 *
 * Un verrou consultatif règle le problème sans infrastructure supplémentaire :
 * une seule instance l'obtient, les autres passent leur tour. C'est le choix
 * retenu tant que la file BullMQ n'est pas en place ; la bascule ne touchera
 * que ce fichier et le planificateur.
 *
 * ── Pourquoi un verrou de TRANSACTION ───────────────────────────────────────
 * La première version prenait un verrou de SESSION (`pg_try_advisory_lock`),
 * relâché par une seconde requête. Or chaque requête part sur la connexion du
 * pool qui se libère — et, en production, derrière le pooler de Neon, sur une
 * connexion serveur partagée entre clients. La libération pouvait donc viser
 * une autre connexion que la prise : le verrou restait accroché à la
 * première, et la tâche était ensuite sautée au hasard, sans erreur, selon la
 * connexion qui se présentait. Pour la réconciliation des paiements — le
 * filet qui rattrape les webhooks perdus —, c'était un risque silencieux.
 *
 * Un verrou de transaction (`pg_try_advisory_xact_lock`) est pris et relâché
 * par la MÊME transaction, qui garde sa connexion du début à la fin, pooler
 * compris. Il ne peut pas fuir : il meurt avec elle, même sur une erreur.
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
   * La tâche elle-même tourne HORS de la transaction qui porte le verrou : ses
   * écritures ne doivent pas dépendre de la vie d'un verrou, ni l'alourdir.
   *
   * @returns le résultat de la tâche, ou `null` si une autre instance l'exécutait.
   */
  async runExclusively<T>(key: AdvisoryLockKey, task: () => Promise<T>): Promise<T | null> {
    const outcome = await this.prisma.$transaction(
      async (tx): Promise<{ acquired: false } | { acquired: true; result: T }> => {
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${key}::bigint) AS locked
        `;

        if (rows[0]?.locked !== true) return { acquired: false };

        return { acquired: true, result: await task() };
      },
      { maxWait: 10_000, timeout: LOCK_TRANSACTION_TIMEOUT_MS },
    );

    if (!outcome.acquired) {
      this.logger.debug(`Verrou ${key} déjà détenu — tâche ignorée sur cette instance`);
      return null;
    }

    return outcome.result;
  }
}
