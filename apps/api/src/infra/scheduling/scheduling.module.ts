import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdvisoryLockService } from './advisory-lock.service';

/**
 * Tâches périodiques.
 *
 * Global : le verrou consultatif est utilisé par plusieurs domaines, et le
 * déclarer une fois évite d'importer ce module partout.
 */
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [AdvisoryLockService],
  exports: [AdvisoryLockService],
})
export class SchedulingModule {}
