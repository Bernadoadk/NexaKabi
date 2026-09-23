import { Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PaymentsModule } from '../payments/payments.module';
import { InvitationsController, OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrgMemberGuard } from './guards/org-member.guard';

/**
 * Le module des paiements est importé pour une seule raison : un compte de
 * réception ne s'enregistre que sur un moyen que le pays de l'organisation
 * autorise en versement, et c'est le routage des paiements qui le sait.
 */
@Module({
  imports: [forwardRef(() => PaymentsModule)],
  controllers: [OrganizationsController, InvitationsController],
  providers: [
    OrganizationsService,
    /**
     * Garde global : il ne s'active que sur les routes portant
     * `@RequirePermission()`. Le déclarer globalement évite d'avoir à penser à
     * l'ajouter sur chaque contrôleur — et donc d'oublier.
     */
    { provide: APP_GUARD, useClass: OrgMemberGuard },
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
