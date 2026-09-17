import { Controller, Get, Logger, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { PayoutsScheduler } from '../finance/payouts.scheduler';
import { NotificationsScheduler } from '../notifications/notifications.scheduler';
import { ReconciliationService } from '../payments/reconciliation.service';
import { StorageProvider } from '../media/storage.provider';
import { CronSecretGuard } from './cron-secret.guard';

/**
 * Noms publics des tâches, tels qu'un planificateur externe les appelle.
 *
 * Le planificateur (cron-job.org aujourd'hui, voir docs/DEPLOYMENT.md §6) porte
 * l'URL et le rythme de chacune — le même rythme que celui du décorateur
 * `@Cron()` correspondant. Renommer une entrée ici sans y toucher là-bas ferait
 * tourner la tâche dans le vide, en 404, sans qu'aucun test ne le voie : les
 * deux vont ensemble.
 */
export const CRON_JOBS = [
  'release-expired-orders',
  'poll-pending-payments',
  'nightly-sweep',
  'reconcile-payouts',
  'send-reminders',
  'retry-outbound',
  'purge-staged-uploads',
] as const;

export type CronJobName = (typeof CRON_JOBS)[number];

/**
 * Déclenchement des tâches périodiques par HTTP.
 *
 * ── Pourquoi ce contrôleur existe ───────────────────────────────────────────
 * Sur une plateforme serverless, le processus ne vit que le temps d'une
 * requête : une minuterie `@Cron()` n'y a aucun sens. Ce contrôleur donne à
 * chaque tâche une URL, et c'est le planificateur de la plateforme qui tient
 * l'horloge (`SCHEDULER_MODE=http`, voir `SchedulingModule`).
 *
 * Il n'ajoute AUCUNE logique : il appelle la méthode `@Cron()` d'origine, qui
 * garde son verrou consultatif. Deux déclenchements qui se chevauchent — un
 * appel externe pendant qu'une instance longue durée fait tourner la même
 * tâche — restent donc sans double effet.
 *
 * `GET` parce que c'est ce que tous les planificateurs savent envoyer, Vercel
 * Cron compris. La requête n'est pas idempotente au sens strict, mais elle
 * l'est au sens qui compte : rejouer un appel ne fait que constater qu'il n'y a
 * plus rien à faire.
 */
@ApiExcludeController()
@Controller('internal/cron')
@UseGuards(CronSecretGuard)
export class CronController {
  private readonly logger = new Logger(CronController.name);

  private readonly jobs: Record<CronJobName, () => Promise<void>>;

  constructor(
    reconciliation: ReconciliationService,
    payouts: PayoutsScheduler,
    notifications: NotificationsScheduler,
    storage: StorageProvider,
  ) {
    this.jobs = {
      'release-expired-orders': () => reconciliation.releaseExpiredOrders(),
      'poll-pending-payments': () => reconciliation.pollPendingPayments(),
      'nightly-sweep': () => reconciliation.nightlySweep(),
      'reconcile-payouts': () => payouts.reconcileProcessing(),
      'send-reminders': () => notifications.hourly(),
      'retry-outbound': () => notifications.retryOutbound(),
      // Dépôts directs jamais conclus (voir `StorageProvider.purgeStaged`) :
      // un ticket vaut une heure, on laisse une journée entière par prudence.
      'purge-staged-uploads': async () => {
        const purged = await storage.purgeStaged(new Date(Date.now() - 24 * 60 * 60 * 1000));
        if (purged > 0) this.logger.log(`Transit purgé : ${purged} fichier(s)`);
      },
    };
  }

  @Public()
  @SkipThrottle()
  @Get(':job')
  async run(@Param('job') job: string): Promise<{ job: CronJobName; durationMs: number }> {
    if (!isCronJobName(job)) {
      throw new NotFoundException(`Tâche inconnue : « ${job} ».`);
    }

    const startedAt = Date.now();
    await this.jobs[job]();
    const durationMs = Date.now() - startedAt;

    this.logger.log(`Tâche ${job} exécutée en ${durationMs} ms`);

    return { job, durationMs };
  }
}

function isCronJobName(value: string): value is CronJobName {
  return (CRON_JOBS as readonly string[]).includes(value);
}
