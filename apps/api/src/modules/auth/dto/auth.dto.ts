import { createZodDto } from 'nestjs-zod';
import {
  completeProfileSchema,
  logoutSchema,
  refreshSessionSchema,
  requestOtpSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from '@nexakabi/contracts';

/**
 * DTO dérivés des schémas Zod partagés.
 *
 * Une seule définition produit la validation, les types du client et la
 * documentation OpenAPI. Modifier le contrat casse la compilation de l'API ET
 * du web — c'est exactement l'effet recherché.
 */
export class RequestOtpDto extends createZodDto(requestOtpSchema) {}
export class VerifyOtpDto extends createZodDto(verifyOtpSchema) {}
export class RefreshSessionDto extends createZodDto(refreshSessionSchema) {}
export class LogoutDto extends createZodDto(logoutSchema) {}
export class CompleteProfileDto extends createZodDto(completeProfileSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
