import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ADVISORY_LOCKS, AdvisoryLockService } from '../../infra/scheduling/advisory-lock.service';
import { SpotlightBookingsService } from './spotlight-bookings.service';

/**
 * Conclusions des places à la une, toutes les heures.
 *
 * Ce qui s'affiche ne dépend pas de cette tâche — la une se lit sur les dates.
 * Elle CONCLUT : délais de paiement écoulés (l'avoir engagé revient), places
 * arrivées à leur fin (bilan envoyé), demandes jamais examinées (argent rendu).
 * L'onglet de l'organisateur et la console la rappellent aussi à leur
 * ouverture : un planificateur en retard ne laisse rien de faux à l'écran.
 *
 * En production, déclenchée par cron-job.org : `GET /api/internal/cron/settle-spotlights`
 * (voir docs/DEPLOYMENT.md §6).
 */
@Injectable()
export class SpotlightsScheduler {
  constructor(
    private readonly bookings: SpotlightBookingsService,
    private readonly locks: AdvisoryLockService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async settle(): Promise<void> {
    await this.locks.runExclusively(ADVISORY_LOCKS.settleSpotlights, () => this.bookings.settle());
  }
}
