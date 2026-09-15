import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createEventSchema, ticketTypeInputSchema, updateEventSchema } from '@nexakabi/contracts';

export class CreateEventDto extends createZodDto(createEventSchema) {}
export class UpdateEventDto extends createZodDto(updateEventSchema) {}
export class TicketTypeDto extends createZodDto(ticketTypeInputSchema) {}

/** L'annulation exige un motif : il est communiqué aux participants remboursés. */
export const cancelEventSchema = z.object({
  reason: z.string().trim().min(10, 'Explique la raison en quelques mots').max(500),
});

export class CancelEventDto extends createZodDto(cancelEventSchema) {}
