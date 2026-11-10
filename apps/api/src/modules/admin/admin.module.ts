import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { MediaModule } from '../media/media.module';
import { NewsletterModule } from '../newsletter/newsletter.module';
import { PaymentsModule } from '../payments/payments.module';
import { SpotlightsModule } from '../spotlights/spotlights.module';
import { AdminNewsletterController } from './admin-newsletter.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSpotlightsController } from './admin-spotlights.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminCommissionsService } from './admin-commissions.service';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';
import { AdminReconciliationService } from './admin-reconciliation.service';
import { AdminOrganizationsService } from './admin-organizations.service';
import { AdminSessionGuard } from './admin-session.guard';
import { AdminStaffService } from './admin-staff.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminAuthController,
  AdminController,
  AdminStaffController,
  PublicReportsController,
} from './admin.controller';
import { EventModerationService } from './event-moderation.service';
import { ModerationService } from './moderation.service';
import { VerificationsService } from './verifications.service';

/**
 * Administration et modération.
 *
 * ── Pourquoi ce module n'est pas `@Global()` ──────────────────────────────
 * Rien d'autre ne doit pouvoir geler des fonds ou statuer sur une vérification.
 * Un module global rendrait ces services injectables partout, et la première
 * fonctionnalité pressée les appellerait depuis un contrôleur organisateur —
 * en contournant le garde qui exige une session d'administration validée.
 */
@Module({
  imports: [FinanceModule, PaymentsModule, NewsletterModule, SpotlightsModule, MediaModule],
  controllers: [
    AdminAuthController,
    AdminStaffController,
    AdminController,
    AdminSettingsController,
    AdminFinanceController,
    AdminNewsletterController,
    AdminSpotlightsController,
    PublicReportsController,
  ],
  providers: [
    AdminAuthService,
    AdminCommissionsService,
    AdminFinanceService,
    AdminReconciliationService,
    AdminOrganizationsService,
    AdminSessionGuard,
    AdminStaffService,
    AdminUsersService,
    EventModerationService,
    ModerationService,
    VerificationsService,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
