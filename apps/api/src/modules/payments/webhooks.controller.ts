import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { paymentProviderSchema, type PaymentProviderCode } from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env';
import { runInBackground } from '../../infra/scheduling/background';
import { Public } from '../auth/decorators/public.decorator';
import { PayoutsService } from '../finance/payouts.service';
import { RefundsService } from '../finance/refunds.service';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './provider.registry';
import { MockPaymentProvider } from './providers/mock-payment.provider';
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

  private readonly webOrigin: string;

  constructor(
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
    private readonly refunds: RefundsService,
    private readonly registry: PaymentProviderRegistry,
    config: ConfigService<Env, true>,
  ) {
    const webUrl =
      config.get('PUBLIC_WEB_URL', { infer: true }) ??
      config.get('CORS_ORIGINS', { infer: true })[0] ??
      'http://localhost:3000';
    this.webOrigin = new URL(webUrl).origin;
  }

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
    const signature = firstHeader(
      request.headers['x-signature'] ?? request.headers['x-mock-signature'],
    );

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

  // ───────────────────────────────────────────────────────────────────────────
  // Page de paiement simulée (carte bancaire, hors production)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * La page « hébergée » du simulateur.
   *
   * Un paiement par carte ne se valide pas sur un téléphone : le participant
   * est envoyé chez le prestataire, saisit sa carte, et revient. Cette page
   * tient ce rôle en développement — deux boutons, et le même enchaînement
   * qu'avec Bictorys : le prestataire NOTIFIE d'abord (webhook), puis RENVOIE
   * le participant. Le tunnel ne conclut jamais sur le seul retour.
   */
  @Public()
  @SkipThrottle()
  @Get('mock/checkout')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  mockCheckoutPage(
    @Query('ref') reference: string,
    @Query('amount') amount: string,
    @Query('currency') currency: string,
    @Query('success') success: string,
    @Query('error') error: string,
    @Res({ passthrough: true }) response: Response,
  ): string {
    this.requireMock();

    if (!reference || !success || !error) {
      throw new BadRequestException('Page de paiement simulée : paramètres manquants.');
    }

    // La politique par défaut de l'API n'autorise les formulaires qu'à
    // s'envoyer à elle-même — et le navigateur l'applique AUSSI à la
    // redirection qui suit l'envoi. Sans cette exception, le retour vers le
    // tunnel serait bloqué avec « form-action » pour seul message.
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${this.webOrigin}; base-uri 'none'; frame-ancestors 'none'`,
    );

    const displayed = safeMoney(Number(amount), currency);

    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paiement simulé · Nexa-Kabi</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#f4f1ea;color:#1b1a17;display:grid;place-items:center;min-height:100vh}
  main{background:#fff;border-radius:20px;padding:32px;max-width:420px;width:calc(100% - 32px);box-shadow:0 12px 40px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 4px}p{margin:0 0 20px;color:#5b584f;font-size:14px;line-height:1.5}
  .amount{font-size:32px;font-weight:700;margin:8px 0 24px}
  form{display:grid;gap:10px}button{font:inherit;font-weight:600;border:0;border-radius:12px;padding:14px;cursor:pointer}
  .ok{background:#1b1a17;color:#fff}.ko{background:#f1ede4;color:#1b1a17}
  small{display:block;margin-top:16px;color:#8a8577;font-size:12px}
</style></head><body><main>
  <h1>Page de paiement simulée</h1>
  <p>Aucune carte n’est demandée : cette page tient lieu de prestataire. Choisis l’issue du paiement.</p>
  <div class="amount">${escapeHtml(displayed)}</div>
  <form method="post">
    <input type="hidden" name="ref" value="${escapeAttr(reference)}">
    <input type="hidden" name="success" value="${escapeAttr(success)}">
    <input type="hidden" name="error" value="${escapeAttr(error)}">
    <button class="ok" name="outcome" value="approve">Valider le paiement</button>
    <button class="ko" name="outcome" value="decline">Refuser le paiement</button>
  </form>
  <small>Référence ${escapeHtml(reference)} · environnement de développement</small>
</main></body></html>`;
  }

  /**
   * Issue choisie sur la page simulée : le webhook part, PUIS le participant
   * revient. L'ordre compte — c'est celui d'un prestataire réel, et c'est ce
   * qui vérifie que l'écran d'attente ne conclut qu'après notification.
   */
  @Public()
  @SkipThrottle()
  @Post('mock/checkout')
  async mockCheckoutOutcome(
    @Body() body: { ref?: string; outcome?: string; success?: string; error?: string },
    @Res() response: Response,
  ): Promise<void> {
    const mock = this.requireMock();

    if (!body.ref || !body.success || !body.error) {
      throw new BadRequestException('Page de paiement simulée : paramètres manquants.');
    }

    const approved = body.outcome === 'approve';
    const payload = JSON.stringify({
      kind: 'payment',
      eventId: `${body.ref}:${approved ? 'succeeded' : 'failed'}`,
      providerReference: body.ref,
      status: approved ? 'SUCCEEDED' : 'FAILED',
      failureCode: approved ? undefined : 'CARD_DECLINED',
      failureReason: approved ? undefined : 'Carte refusée par la banque émettrice.',
      providerFeeAmount: 0,
    });

    const event = await mock.parseWebhook({
      headers: { 'x-mock-signature': mock.sign(payload) },
      rawBody: payload,
    });

    if (event.kind === 'payment') {
      await this.payments.handleWebhook('mock', event, payload, mock.sign(payload));
    }

    response.redirect(303, this.safeReturnUrl(approved ? body.success : body.error));
  }

  // ───────────────────────────────────────────────────────────────────────────

  private resolveProvider(param: string): PaymentProviderCode {
    const parsed = paymentProviderSchema.safeParse(param);

    if (!parsed.success || !this.registry.has(parsed.data)) {
      throw new NotFoundException('Prestataire inconnu.');
    }

    return parsed.data;
  }

  private requireMock(): MockPaymentProvider {
    if (!this.registry.has('mock')) {
      throw new NotFoundException('Le simulateur de paiement n’est pas disponible.');
    }

    const provider = this.registry.get('mock');

    if (!(provider instanceof MockPaymentProvider)) {
      throw new NotFoundException('Le simulateur de paiement n’est pas disponible.');
    }

    return provider;
  }

  /** N'accepte qu'une adresse http(s) : jamais de redirection vers `javascript:`. */
  private safeReturnUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch {
      // adresse illisible : traitée ci-dessous
    }
    throw new BadRequestException('Adresse de retour invalide.');
  }
}

function safeMoney(amount: number, currency: string): string {
  try {
    return formatMoney(Number.isInteger(amount) ? amount : 0, currency);
  } catch {
    return `${amount} ${currency}`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
