import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ADVISORY_LOCKS, AdvisoryLockService } from '../../infra/scheduling/advisory-lock.service';
import { PayoutsService } from './payouts.service';

/**
 * Réconciliation des versements.
 *
 * Même constat que pour les paiements : un versement Mobile Money est accepté
 * puis exécuté plus tard, et personne ne nous prévient forcément quand il
 * aboutit. Sans interrogation régulière, un retrait « en cours » le resterait
 * pour toujours — avec l'argent bel et bien arrivé chez l'organisateur.
 *
 * Le verrou consultatif garantit qu'une seule instance interroge à la fois :
 * deux passages concurrents concluraient deux fois le même versement.
 */
@Injectable()
export class PayoutsScheduler {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly locks: AdvisoryLockService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileProcessing(): Promise<void> {
    await this.locks.runExclusively(ADVISORY_LOCKS.reconcilePayouts, async () => {
      await this.payouts.reconcileProcessing();
    });
  }
}
