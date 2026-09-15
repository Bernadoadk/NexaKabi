import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { syncScansSchema } from '@nexakabi/contracts';

export class SyncScansDto extends createZodDto(syncScansSchema) {}

/** Annuler une entrée exige un motif : sans lui, un litige est inarbitrable. */
export const revokeCheckInSchema = z.object({
  reason: z.string().trim().min(3, 'Indique la raison en quelques mots').max(200),
});

export class RevokeCheckInDto extends createZodDto(revokeCheckInSchema) {}
