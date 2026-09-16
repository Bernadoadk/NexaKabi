import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import type { Env } from '../../config/env';
import { AdvisoryLockService } from './advisory-lock.service';

/**
 * Tâches périodiques.
 *
 * Global : le verrou consultatif est utilisé par plusieurs domaines, et le
 * déclarer une fois évite d'importer ce module partout.
 *
 * ── Deux déclencheurs pour les mêmes tâches ─────────────────────────────────
 * Les méthodes `@Cron()` des domaines restent la définition de référence de
 * chaque tâche. Ce qui varie, c'est QUI les appelle :
 *
 *  · `SCHEDULER_MODE=in-process` — les minuteries sont armées ici, dans le
 *    processus, comme sur tout serveur qui tourne en continu.
 *  · `SCHEDULER_MODE=http` — aucune minuterie. Une fonction serverless n'a pas
 *    de durée de vie garantie : une minuterie y partirait au hasard des
 *    instances chaudes, ou jamais. Les tâches sont alors déclenchées par un
 *    planificateur externe via `CronController`, qui appelle exactement les
 *    mêmes méthodes.
 *
 * `forRootAsync` plutôt que `forRoot` : la valeur vient de la configuration
 * validée, pas de `process.env` lu au moment où le décorateur s'évalue — trop
 * tôt pour que le fichier `.env` soit chargé.
 */
@Global()
@Module({
  imports: [
    ScheduleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const inProcess = config.get('SCHEDULER_MODE', { infer: true }) === 'in-process';
        return { cronJobs: inProcess, intervals: inProcess, timeouts: inProcess };
      },
    }),
  ],
  providers: [AdvisoryLockService],
  exports: [AdvisoryLockService],
})
export class SchedulingModule {}
