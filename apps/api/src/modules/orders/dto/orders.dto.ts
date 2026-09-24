import { createZodDto } from 'nestjs-zod';
import {
  buyerDetailsSchema,
  confirmOrderSchema,
  confirmPaymentSchema,
  createOrderSchema,
  initiatePaymentSchema,
} from '@nexakabi/contracts';

export class CreateOrderDto extends createZodDto(createOrderSchema) {}
export class BuyerDetailsDto extends createZodDto(buyerDetailsSchema) {}
export class ConfirmOrderDto extends createZodDto(confirmOrderSchema) {}
export class InitiatePaymentDto extends createZodDto(initiatePaymentSchema) {}
export class ConfirmPaymentDto extends createZodDto(confirmPaymentSchema) {}
