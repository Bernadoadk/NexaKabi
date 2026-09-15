import { createZodDto } from 'nestjs-zod';
import {
  createOrganizationSchema,
  createPayoutAccountSchema,
  inviteMemberSchema,
  submitVerificationSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
  uploadVerificationDocumentSchema,
} from '@nexakabi/contracts';

/** DTO dérivés des schémas Zod partagés — une seule définition fait foi. */
export class CreateOrganizationDto extends createZodDto(createOrganizationSchema) {}
export class UpdateOrganizationDto extends createZodDto(updateOrganizationSchema) {}
export class InviteMemberDto extends createZodDto(inviteMemberSchema) {}
export class UpdateMemberRoleDto extends createZodDto(updateMemberRoleSchema) {}
export class CreatePayoutAccountDto extends createZodDto(createPayoutAccountSchema) {}
export class SubmitVerificationDto extends createZodDto(submitVerificationSchema) {}
export class UploadVerificationDocumentDto extends createZodDto(uploadVerificationDocumentSchema) {}
