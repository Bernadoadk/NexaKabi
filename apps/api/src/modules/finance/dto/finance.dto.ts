import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requestPayoutSchema } from '@nexakabi/contracts';

export class RequestPayoutDto extends createZodDto(requestPayoutSchema) {}

/** Simulation d'un retrait, avant validation. */
export const quotePayoutSchema = z.object({
  amount: z.coerce.number().int().min(1),
});

export class QuotePayoutDto extends createZodDto(quotePayoutSchema) {}
