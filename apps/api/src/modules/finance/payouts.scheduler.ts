import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ADVISORY_LOCKS, AdvisoryLockService } from '../../infra/scheduling/advisory-lock.service';
import { PayoutsService } from './payouts.service';
import { RefundsService } from './refunds.service';

/**
 * Réconciliation de l'argent qui SORT : versements et remboursements.
 *
 * Même constat que pour les paiements : un versement ou un remboursement
 * Mobile Money est accepté puis exécuté plus tard, et personne ne nous
 * prévient forcément quand il aboutit. Sans interrogation régulière, un
 * retrait « en cours » le resterait pour toujours — avec l'argent bel et bien
 * arrivé chez l'organisateur —, et un participant remboursé resterait « en
 * attente » dans la console.
 *
 * Les deux vont ensemble parce qu'ils se concluent de la même façon, et
 * qu'une seule tâche planifiée (`reconcile-payouts`) les déclenche. Chacun a
 * son verrou consultatif : deux instances ne concluent jamais deux fois la
 * même opération.
 */
@Injectable()
export class PayoutsScheduler {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly refunds: RefundsService,
    private readonly locks: AdvisoryLockService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileProcessing(): Promise<void> {
    await this.locks.runExclusively(ADVISORY_LOCKS.reconcilePayouts, async () => {
      await this.payouts.reconcileProcessing();
    });

    await this.locks.runExclusively(ADVISORY_LOCKS.reconcileRefunds, async () => {
      await this.refunds.reconcileProcessing();
    });
  }
}
