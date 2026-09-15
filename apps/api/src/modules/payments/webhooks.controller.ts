import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { paymentProviderSchema, type PaymentProviderCode } from '@nexakabi/contracts';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './provider.registry';
import { WebhookSignatureError } from './providers/payment-provider';

/** Requête Express portant le corps brut, activé par `rawBody: true`. */
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Réception des webhooks d'opérateurs.
 *
 * Quatre règles, toutes issues du comportement réel des opérateurs Mobile
 * Money :
 *
 *  1. **La signature est vérifiée avant toute lecture du corps.** Sans cela,
 *     n'importe qui peut déclarer un paiement réussi.
 *  2. **Le corps BRUT est signé**, pas l'objet reparsé : un `JSON.parse` suivi
 *     d'un `JSON.stringify` change les espaces et invalide la signature.
 *  3. **On répond toujours 200**, même sur un rejeu ou un événement inconnu.
 *     Un opérateur qui reçoit une erreur rejoue en boucle, puis abandonne.
 *  4. **Aucune limitation de débit** : ce n'est pas du trafic utilisateur, et
 *     une salve de notifications après un incident est justement le moment où
 *     il ne faut rien perdre.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.4.
 */
@ApiExcludeController()
@Controller('webhooks/payments')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  @Public()
  @SkipThrottle()
  @Post(':provider')
  @HttpCode(200)
  async receive(
    @Param('provider') providerParam: string,
    @Req() request: RawBodyRequest,
  ): Promise<{ received: boolean; duplicate?: boolean }> {
    const parsed = paymentProviderSchema.safeParse(providerParam);

    if (!parsed.success) {
      throw new BadRequestException('Opérateur inconnu.');
    }

    const providerCode: PaymentProviderCode = parsed.data;
    const provider = this.registry.get(providerCode);

    const rawBody = request.rawBody?.toString('utf8');

    if (!rawBody) {
      throw new BadRequestException('Corps de webhook vide.');
    }

    let event;

    try {
      event = await provider.parseWebhook({ headers: request.headers, rawBody });
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        // Seul cas où l'on refuse : une signature invalide n'est pas un
        // incident réseau, c'est une tentative. On la refuse bruyamment.
        this.logger.error(`Signature de webhook invalide pour ${providerCode}`);
        throw new UnauthorizedException('Signature invalide.');
      }

      this.logger.error({ err: error, providerCode }, 'Webhook illisible');
      throw new BadRequestException('Charge utile de webhook illisible.');
    }

    const result = await this.payments.handleWebhook(
      providerCode,
      event,
      rawBody,
      firstHeader(request.headers['x-signature'] ?? request.headers['x-mock-signature']),
    );

    return { received: true, duplicate: result.duplicate };
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
