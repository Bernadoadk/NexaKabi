import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SINGLE_FILE_UPLOAD } from '../media/upload.constraints';
import { ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createOrganizationSchema,
  createPayoutAccountSchema,
  inviteMemberSchema,
  submitVerificationSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
  uploadVerificationDocumentSchema,
  type Invitation,
  type Member,
  type Organization,
  type OrganizationSummary,
  type PayoutAccount,
  type VerificationRequestDetail,
} from '@nexakabi/contracts';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { CurrentOrg } from './decorators/current-org.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';
import type { OrgContext } from './guards/org-member.guard';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  CreatePayoutAccountDto,
  InviteMemberDto,
  SubmitVerificationDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
  UploadVerificationDocumentDto,
} from './dto/organizations.dto';

interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Organisations et équipes.
 *
 * L'organisation active est portée par l'en-tête `X-Organization-Id` : le
 * sélecteur du prototype ne change pas l'URL des écrans transverses.
 */
@ApiTags('Organisations')
@ApiHeader({
  name: 'X-Organization-Id',
  description: "Organisation active. Requis sur toutes les routes d'équipe et de finances.",
  required: false,
})
@Controller('organizer/organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes organisations' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<OrganizationSummary[]> {
    return this.organizations.listForUser(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Créer une organisation',
    description:
      'Le créateur en devient propriétaire : ce rôle est unique et ne peut être ni ' +
      'révoqué ni modifié, seulement transféré.',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateOrganizationDto,
  ): Promise<Organization> {
    return this.organizations.create(user.id, createOrganizationSchema.parse(body));
  }

  @Get('current')
  @RequirePermission('organization:read')
  @ApiOperation({ summary: "Détail de l'organisation active" })
  current(@CurrentOrg() context: OrgContext): Promise<Organization> {
    return this.organizations.findById(context.organizationId);
  }

  @Patch('current')
  @RequirePermission('organization:update')
  @ApiOperation({ summary: "Modifier l'organisation active" })
  update(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.organizations.update(context, user.id, updateOrganizationSchema.parse(body));
  }

  // ── Équipe ────────────────────────────────────────────────────────────────

  @Get('current/members')
  @RequirePermission('member:read')
  @ApiOperation({
    summary: "Membres de l'organisation",
    description: "Les coordonnées complètes ne sont exposées qu'aux rôles qui en ont l'usage.",
  })
  listMembers(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Member[]> {
    return this.organizations.listMembers(context, user.id);
  }

  @Post('current/invitations')
  @RequirePermission('member:invite')
  @ApiOperation({
    summary: 'Inviter un membre',
    description:
      'Renvoie un lien à usage unique, valable 7 jours, à transmettre par WhatsApp. ' +
      "Pour un contrôleur, l'événement et la porte sont obligatoires.",
  })
  invite(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InviteMemberDto,
  ) {
    return this.organizations.invite(context, user.id, inviteMemberSchema.parse(body));
  }

  @Patch('current/members/:memberId')
  @RequirePermission('member:invite')
  @ApiOperation({ summary: "Modifier le rôle d'un membre" })
  updateMemberRole(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRoleDto,
  ): Promise<Member[]> {
    return this.organizations.updateMemberRole(
      context,
      user.id,
      memberId,
      updateMemberRoleSchema.parse(body),
    );
  }

  @Delete('current/members/:memberId')
  @RequirePermission('member:remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer un membre' })
  removeMember(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    return this.organizations.removeMember(context, user.id, memberId);
  }

  // ── Comptes de retrait ────────────────────────────────────────────────────

  @Get('current/payout-accounts')
  @RequirePermission('payout_account:manage')
  @ApiOperation({ summary: 'Comptes de réception des retraits' })
  listPayoutAccounts(@CurrentOrg() context: OrgContext): Promise<PayoutAccount[]> {
    return this.organizations.listPayoutAccounts(context);
  }

  @Post('current/payout-accounts')
  @RequirePermission('payout_account:manage')
  @ApiOperation({ summary: 'Ajouter un compte de réception' })
  addPayoutAccount(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePayoutAccountDto,
  ): Promise<PayoutAccount> {
    return this.organizations.addPayoutAccount(
      context,
      user.id,
      createPayoutAccountSchema.parse(body),
    );
  }

  // ── Vérification ──────────────────────────────────────────────────────────

  @Get('current/verification')
  @RequirePermission('organization:read')
  @ApiOperation({ summary: 'Mon dossier de vérification' })
  getVerification(@CurrentOrg() context: OrgContext): Promise<VerificationRequestDetail | null> {
    return this.organizations.getMyVerification(context.organizationId);
  }

  @Post('current/verification')
  @RequirePermission('organization:update')
  @ApiOperation({
    summary: 'Soumettre le dossier de vérification',
    description:
      'Crée le dossier au premier envoi, ou le renvoie en instruction s’il était ' +
      'incomplet ou refusé. Sans effet sur un dossier déjà vérifié ou déjà en attente.',
  })
  submitVerification(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubmitVerificationDto,
  ): Promise<VerificationRequestDetail> {
    return this.organizations.submitVerification(
      context,
      user.id,
      submitVerificationSchema.parse(body),
    );
  }

  @Post('current/verification/documents')
  @RequirePermission('organization:update')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Déposer une pièce à l’appui du dossier',
    description:
      'JPG, PNG, WebP ou PDF, 8 Mo au maximum. Stockage privé : jamais accessible par une ' +
      'URL directe, seulement par une URL signée générée à la lecture, côté administration.',
  })
  async uploadVerificationDocument(
    @CurrentOrg() context: OrgContext,
    @Body() body: UploadVerificationDocumentDto,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<VerificationRequestDetail> {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }

    const { type } = uploadVerificationDocumentSchema.parse(body);

    return this.organizations.addVerificationDocument(context, type, {
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
  }
}

/**
 * Invitations.
 *
 * Séparé du contrôleur d'organisation : consulter une invitation se fait AVANT
 * d'être membre, donc sans contexte d'organisation.
 */
@ApiTags('Organisations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Public()
  @Get(':token')
  @ApiOperation({
    summary: "Détail d'une invitation",
    description:
      "Accessible sans compte : l'invité découvre l'organisation et son rôle avant " +
      'de se connecter.',
  })
  describe(@Param('token') token: string): Promise<Invitation> {
    return this.organizations.describeInvitation(token);
  }

  @Post(':token/accept')
  @ApiOperation({ summary: 'Accepter une invitation' })
  accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganizationSummary> {
    return this.organizations.acceptInvitation(token, user.id);
  }
}
