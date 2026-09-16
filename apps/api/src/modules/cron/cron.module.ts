import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { CronController } from './cron.controller';
import { CronSecretGuard } from './cron-secret.guard';

/**
 * Déclenchement externe des tâches périodiques.
 *
 * Feuille de l'arbre des modules : il consomme les planificateurs des
 * domaines, aucun domaine ne dépend de lui. Voir `CronController`.
 */
@Module({
  imports: [PaymentsModule, FinanceModule, NotificationsModule],
  controllers: [CronController],
  providers: [CronSecretGuard],
})
export class CronModule {}
