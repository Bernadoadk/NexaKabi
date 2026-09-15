import { Module, forwardRef } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { TicketsModule } from '../tickets/tickets.module';
import { FinanceController } from './finance.controller';
import { LedgerService } from './ledger.service';
import { PayoutsScheduler } from './payouts.scheduler';
import { PayoutsService } from './payouts.service';
import { RefundsService } from './refunds.service';
import { StatsService } from './stats.service';

/**
 * Finance.
 *
 * `LedgerService` est exporté pour être appelé DANS la transaction qui confirme
 * un paiement : une recette enregistrée après coup laisserait une fenêtre où le
 * solde ne correspondrait pas aux encaissements.
 */
@Module({
  imports: [TicketsModule, forwardRef(() => PaymentsModule)],
  controllers: [FinanceController],
  providers: [LedgerService, PayoutsService, PayoutsScheduler, StatsService, RefundsService],
  exports: [LedgerService, PayoutsService, StatsService, RefundsService],
})
export class FinanceModule {}
