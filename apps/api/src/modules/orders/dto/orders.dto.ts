import { createZodDto } from 'nestjs-zod';
import {
  buyerDetailsSchema,
  confirmOrderSchema,
  createOrderSchema,
  initiatePaymentSchema,
} from '@nexakabi/contracts';

export class CreateOrderDto extends createZodDto(createOrderSchema) {}
export class BuyerDetailsDto extends createZodDto(buyerDetailsSchema) {}
export class ConfirmOrderDto extends createZodDto(confirmOrderSchema) {}
export class InitiatePaymentDto extends createZodDto(initiatePaymentSchema) {}
