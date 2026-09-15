import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InvitationsController, OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrgMemberGuard } from './guards/org-member.guard';

@Module({
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
