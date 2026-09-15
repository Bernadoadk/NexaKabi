import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ADVISORY_LOCKS, AdvisoryLockService } from '../../infra/scheduling/advisory-lock.service';
import { OutboundService } from './outbound.service';
import { RemindersService } from './reminders.service';

/**
 * Déclenchement périodique des rappels.
 *
 * ── Pourquoi toutes les heures, et pas plus souvent ───────────────────────
 * La fenêtre de balayage fait une heure (voir `RemindersService.sweep`). Passer
 * plus souvent ne trouverait rien de neuf entre deux passages, et repasserait
 * sur les mêmes événements pour rien — l'index unique les rejetterait, mais la
 * requête aurait quand même tourné.
 *
 * ── Pourquoi à la 7e minute ─────────────────────────────────────────────────
 * Pas à l'heure pile. Les tâches calées sur `0 * * * *` s'exécutent toutes
 * ensemble — réconciliation, expiration, rappels — et se disputent le même pool
 * de connexions. Sept minutes de décalage suffisent à les séparer.
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly reminders: RemindersService,
    private readonly outbound: OutboundService,
    private readonly locks: AdvisoryLockService,
  ) {}

  @Cron('7 * * * *')
  async hourly(): Promise<void> {
    await this.locks.runExclusively(ADVISORY_LOCKS.sendReminders, async () => {
      const report = await this.reminders.tick();

      if (report.reminders > 0 || report.retried > 0) {
        this.logger.log(
          `Rappels : ${report.reminders} envoyé(s), ${report.retried} diffusion(s) reprise(s)`,
        );
      }
    });
  }

  /**
   * Reprise plus fréquente des envois en souffrance.
   *
   * Un opérateur indisponible cinq minutes ne doit pas retarder d'une heure la
   * confirmation de paiement de quelqu'un. Les rappels, eux, tolèrent l'attente.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryOutbound(): Promise<void> {
    // Verrou distinct de celui des rappels : les deux tâches sont
    // indépendantes, et les faire se bloquer l'une l'autre retarderait la
    // reprise de dix minutes chaque fois que le balayage horaire tourne.
    await this.locks.runExclusively(ADVISORY_LOCKS.retryOutbound, async () => {
      await this.outbound.retryPending();
    });
  }
}
