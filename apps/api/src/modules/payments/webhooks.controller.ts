import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { paymentProviderSchema, type PaymentProviderCode } from '@nexakabi/contracts';
import type { Request } from 'express';
import { runInBackground } from '../../infra/scheduling/background';
import { Public } from '../auth/decorators/public.decorator';
import { PayoutsService } from '../finance/payouts.service';
import { RefundsService } from '../finance/refunds.service';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './provider.registry';
import { WebhookIgnoredError, WebhookSignatureError } from './providers/payment-provider';

/** Requête Express portant le corps brut, activé par `rawBody: true`. */
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Réception des webhooks de prestataires.
 *
 * Quatre règles, toutes issues du comportement réel des prestataires :
 *
 *  1. **L'authenticité est vérifiée avant toute lecture du corps.** Sans cela,
 *     n'importe qui peut déclarer un paiement réussi.
 *  2. **Le corps BRUT est vérifié**, pas l'objet reparsé : un `JSON.parse`
 *     suivi d'un `JSON.stringify` change les espaces et invalide une signature.
 *  3. **On répond toujours 200**, même sur un rejeu ou un événement inconnu.
 *     Un prestataire qui reçoit une erreur rejoue en boucle, puis abandonne.
 *  4. **Aucune limitation de débit** : ce n'est pas du trafic utilisateur, et
 *     une salve de notifications après un incident est justement le moment où
 *     il ne faut rien perdre.
 *  5. **On accuse réception AVANT de traiter.** Une notification authentifiée
 *     est acquittée aussitôt, puis traitée en arrière-plan. Kkiapay retente
 *     cinq fois en quelques secondes seulement, puis abandonne — moins qu'un
 *     premier encaissement sur une instance qui démarre. Un traitement
 *     interrompu n'est pas perdu : la réconciliation relit l'état chez le
 *     prestataire chaque minute.
 *
 * Un même point de terminaison reçoit les encaissements, les versements et
 * les remboursements : c'est la notification normalisée qui dit de quoi elle
 * parle, et chacune va au service qui la comprend.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.4.
 */
@ApiExcludeController()
@Controller('webhooks/payments')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
    private readonly refunds: RefundsService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  @Public()
  @SkipThrottle()
  @Post(':provider')
  @HttpCode(200)
  async receive(
    @Param('provider') providerParam: string,
    @Req() request: RawBodyRequest,
  ): Promise<{ received: boolean }> {
    const providerCode = this.resolveProvider(providerParam);
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
        // Seul cas où l'on refuse : une authentification invalide n'est pas un
        // incident réseau, c'est une tentative. On la refuse bruyamment.
        this.logger.error(`Authentification de webhook invalide pour ${providerCode}`);
        throw new UnauthorizedException('Signature invalide.');
      }

      if (error instanceof WebhookIgnoredError) {
        // Remboursement, règlement : rien à faire, et surtout pas une erreur —
        // le prestataire rejouerait ce qui n'a pas à être rejoué.
        this.logger.log(`Webhook ${providerCode} ignoré : ${error.message}`);
        return { received: true };
      }

      this.logger.error({ err: error, providerCode }, 'Webhook illisible');
      throw new BadRequestException('Charge utile de webhook illisible.');
    }

    // Conservée pour l'audit, quand c'est une VRAIE signature. Jamais
    // `x-kkiapay-secret` ni `X-Secret-Key` (Bictorys) : ces en-têtes portent le
    // secret lui-même — l'écrire en base revenait à stocker le secret du
    // webhook en clair, à chaque notification.
    const signature = firstHeader(request.headers['x-signature']);

    // Authentifiée et lisible : on acquitte, le traitement suit. Les refus
    // (401, 400) sont tous tombés au-dessus — un prestataire ne rejoue pas une
    // erreur 4xx, et c'est ce qu'on veut pour une notification invalide.
    runInBackground(`Webhook ${providerCode}/${event.externalId}`, async () => {
      if (event.kind === 'payout') {
        await this.payouts.handleProviderEvent(providerCode, event);
        return;
      }

      if (event.kind === 'refund') {
        await this.refunds.handleProviderEvent(providerCode, event);
        return;
      }

      await this.payments.handleWebhook(providerCode, event, rawBody, signature);
    });

    return { received: true };
  }

  private resolveProvider(param: string): PaymentProviderCode {
    const parsed = paymentProviderSchema.safeParse(param);

    if (!parsed.success || !this.registry.has(parsed.data)) {
      throw new NotFoundException('Prestataire inconnu.');
    }

    return parsed.data;
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
