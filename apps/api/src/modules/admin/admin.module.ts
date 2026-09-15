import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { AdminAuthService } from './admin-auth.service';
import { AdminOrganizationsService } from './admin-organizations.service';
import { AdminSessionGuard } from './admin-session.guard';
import { AdminUsersService } from './admin-users.service';
import { AdminAuthController, AdminController, PublicReportsController } from './admin.controller';
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
  imports: [FinanceModule],
  controllers: [AdminAuthController, AdminController, PublicReportsController],
  providers: [
    AdminAuthService,
    AdminOrganizationsService,
    AdminSessionGuard,
    AdminUsersService,
    EventModerationService,
    ModerationService,
    VerificationsService,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
