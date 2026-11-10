import { Module, forwardRef } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrganizerSpotlightController } from './organizer-spotlight.controller';
import { SpotlightBookingSettlement } from './spotlight-booking-settlement';
import { SpotlightBookingsService } from './spotlight-bookings.service';
import { SpotlightCreditsService } from './spotlight-credits.service';
import { SpotlightReceiptService } from './spotlight-receipt.service';
import { SpotlightSettingsService } from './spotlight-settings.service';
import { SpotlightStatsService } from './spotlight-stats.service';
import { SpotlightsAdminService } from './spotlights-admin.service';
import { SpotlightsController } from './spotlights.controller';
import { SpotlightsScheduler } from './spotlights.scheduler';
import { SpotlightsService } from './spotlights.service';

/**
 * À la une : les mises en avant de Découvrir et de l'accueil, et les places
 * que les organisateurs y achètent.
 *
 * Les routes de la console vivent dans `AdminModule`, derrière son garde de
 * session — ce module leur fournit les services.
 *
 * ── Le cycle avec les paiements ─────────────────────────────────────────────
 * Une place se paie par le circuit d'encaissement commun (`PaymentsService`),
 * qui, une fois l'argent reçu, rend la main à ce module pour régler la place
 * dans sa propre transaction (`SpotlightBookingSettlement`). Les deux modules
 * se référencent donc l'un l'autre : la référence différée le résout au
 * démarrage, comme entre paiements et commandes.
 */
@Module({
  imports: [forwardRef(() => PaymentsModule), forwardRef(() => FinanceModule)],
  controllers: [SpotlightsController, OrganizerSpotlightController],
  providers: [
    SpotlightSettingsService,
    SpotlightsService,
    SpotlightsAdminService,
    SpotlightStatsService,
    SpotlightCreditsService,
    SpotlightBookingSettlement,
    SpotlightBookingsService,
    SpotlightReceiptService,
    SpotlightsScheduler,
  ],
  exports: [
    SpotlightSettingsService,
    SpotlightsAdminService,
    SpotlightBookingsService,
    SpotlightBookingSettlement,
    SpotlightsScheduler,
  ],
})
export class SpotlightsModule {}
