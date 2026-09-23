import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CheckoutPaymentMethods,
  type Order,
  type PaymentState,
  type Ticket,
} from '@nexakabi/contracts';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ReqContext } from '../auth/decorators/request-context.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import type { RequestContext } from '../auth/auth.service';
import { PaymentsService } from '../payments/payments.service';
import { TicketsService } from '../tickets/tickets.service';
import { CheckoutTokenService } from './checkout-token.service';
import { CHECKOUT_TOKEN_HEADER, CheckoutAccessGuard } from './guards/checkout-access.guard';
import { toOrder } from './orders.mapper';
import { OrdersService } from './orders.service';
import {
  BuyerDetailsDto,
  ConfirmOrderDto,
  CreateOrderDto,
  InitiatePaymentDto,
} from './dto/orders.dto';

/**
 * Tunnel d'achat.
 *
 * Entièrement accessible sans compte : imposer une inscription avant l'achat
 * est la première cause d'abandon sur ce marché (voir PROJECT_ANALYSIS.md §8,
 * A3). L'accès à une commande donnée est protégé par le jeton de checkout, pas
 * par une session.
 */
@ApiTags('Tunnel d’achat')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly tickets: TicketsService,
    private readonly tokens: CheckoutTokenService,
  ) {}

  /**
   * Étape 1 · crée la commande et bloque les places.
   *
   * Répond avec le jeton d'accès : c'est la seule fois où il est transmis.
   */
  @Public()
  @Post('orders')
  @ApiOperation({ summary: 'Créer une commande et réserver les places' })
  async create(
    @Body() body: CreateOrderDto,
    @ReqContext() context: RequestContext,
  ): Promise<{ order: Order; checkoutToken: string }> {
    const order = await this.orders.create(body, {
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      order: toOrder(order),
      checkoutToken: await this.tokens.issue(order.id, order.reference),
    };
  }

  @Public()
  @UseGuards(CheckoutAccessGuard)
  @Get('orders/:reference')
  @ApiHeader({ name: CHECKOUT_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'Consulter une commande en cours' })
  async findOne(@Param('reference') reference: string): Promise<Order> {
    return this.orders.findByReference(reference.toUpperCase());
  }

  /** Étape 1b · coordonnées de l'acheteur. N'ouvre pas encore le paiement. */
  @Public()
  @UseGuards(CheckoutAccessGuard)
  @Patch('orders/:reference/buyer')
  @ApiHeader({ name: CHECKOUT_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'Renseigner les coordonnées de l’acheteur' })
  async setBuyer(
    @Param('reference') reference: string,
    @Body() body: BuyerDetailsDto,
  ): Promise<Order> {
    const order = await this.orders.setBuyerDetails(reference.toUpperCase(), body);
    return toOrder(order);
  }

  /**
   * Billets émis pour cette commande.
   *
   * Servis au porteur du jeton de checkout, donc sans compte : l'acheteur doit
   * atteindre ses billets depuis l'écran de confirmation, immédiatement, sans
   * détour par une inscription.
   */
  @Public()
  @UseGuards(CheckoutAccessGuard)
  @Get('orders/:reference/tickets')
  @ApiHeader({ name: CHECKOUT_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'Billets émis pour la commande' })
  async listTickets(@Param('reference') reference: string): Promise<Ticket[]> {
    return this.tickets.listForOrder(reference.toUpperCase());
  }

  /** Étape 2 · confirmation du récapitulatif : c'est elle qui ouvre le paiement. */
  @Public()
  @UseGuards(CheckoutAccessGuard)
  @Post('orders/:reference/confirm')
  @ApiHeader({ name: CHECKOUT_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'Accepter les conditions et ouvrir le paiement' })
  async confirm(
    @Param('reference') reference: string,
    @Body() body: ConfirmOrderDto,
  ): Promise<Order> {
    const order = await this.orders.confirm(reference.toUpperCase(), body);
    return toOrder(order);
  }

  @Public()
  @UseGuards(CheckoutAccessGuard)
  @Post('orders/:reference/cancel')
  @ApiHeader({ name: CHECKOUT_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'Abandonner une commande et libérer les places' })
  async cancel(@Param('reference') reference: string): Promise<Order> {
    return this.orders.cancel(reference.toUpperCase());
  }

  /**
   * Étape 3 · moyens de paiement proposés POUR CETTE COMMANDE.
   *
   * Ils dépendent du pays de l'événement : à Cotonou MTN, Moov et la carte ;
   * à Dakar Wave et Orange Money. La liste vient de la configuration du pays,
   * filtrée par ce que le prestataire sait réellement faire.
   */
  @Public()
  @UseGuards(CheckoutAccessGuard)
  @Get('orders/:reference/payment-methods')
  @ApiHeader({ name: CHECKOUT_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'Moyens de paiement disponibles pour la commande' })
  listPaymentMethods(@Param('reference') reference: string): Promise<CheckoutPaymentMethods> {
    return this.payments.listMethods(reference.toUpperCase());
  }

  @Public()
  @UseGuards(CheckoutAccessGuard)
  @Post('orders/:reference/payments')
  @ApiHeader({ name: CHECKOUT_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'Déclencher la demande de paiement' })
  async initiatePayment(
    @Param('reference') reference: string,
    @Body() body: InitiatePaymentDto,
  ): Promise<PaymentState> {
    return this.payments.initiate(reference.toUpperCase(), body);
  }

  /**
   * État du paiement, interrogé en boucle par l'écran d'attente.
   *
   * Ne renvoie jamais « échec » sur la seule foi d'un délai écoulé : seul
   * l'opérateur tranche, par webhook ou par interrogation.
   */
  @Public()
  @UseGuards(CheckoutAccessGuard)
  @Get('orders/:reference/payments/:paymentId')
  @ApiHeader({ name: CHECKOUT_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'État d’un paiement' })
  async paymentState(
    @Param('reference') reference: string,
    @Param('paymentId') paymentId: string,
  ): Promise<PaymentState> {
    return this.payments.getState(reference.toUpperCase(), paymentId);
  }
}

/**
 * Commandes d'un participant connecté.
 *
 * Séparé du tunnel : ici l'autorisation vient de la session, et l'historique
 * inclut les commandes payées comme abandonnées.
 */
@ApiTags('Mes commandes')
@Controller('me/orders')
export class MyOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Historique des commandes' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<Order[]> {
    return this.orders.listForUser(user.id);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'Détail d’une commande' })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reference') reference: string,
  ): Promise<Order> {
    return this.orders.findForUser(user.id, reference.toUpperCase());
  }
}
