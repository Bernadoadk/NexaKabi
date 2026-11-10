import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import {
  confirmSpotlightPaymentSchema,
  createSpotlightBookingSchema,
  paySpotlightBookingSchema,
  stagedUploadSchema,
  type PaymentState,
  type SpotlightBooking,
  type SpotlightBookingCreated,
  type SpotlightOffer,
  type SpotlightVideo,
  type SpotlightVideoTicket,
} from '@nexakabi/contracts';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { StorageProvider } from '../media/storage.provider';
import { CurrentOrg } from '../organizations/decorators/current-org.decorator';
import { RequirePermission } from '../organizations/decorators/require-permission.decorator';
import type { OrgContext } from '../organizations/guards/org-member.guard';
import { SpotlightBookingsService } from './spotlight-bookings.service';
import { SpotlightReceiptService } from './spotlight-receipt.service';

class CreateBookingDto extends createZodDto(createSpotlightBookingSchema) {}
class PayBookingDto extends createZodDto(paySpotlightBookingSchema) {}
class ConfirmPaymentDto extends createZodDto(confirmSpotlightPaymentSchema) {}
class StagedVideoDto extends createZodDto(stagedUploadSchema) {}

/**
 * Mise en avant — l'onglet de l'événement, côté organisateur.
 *
 * `promo:manage` : propriétaire, administrateurs et gestionnaires. Payer avec
 * le SOLDE demande en plus le droit de retirer l'argent (`payout:request`),
 * vérifié par le service : un gestionnaire peut acheter une place par Mobile
 * Money, pas dépenser la recette de l'organisation.
 *
 * L'organisation est celle de l'événement de l'URL (`OrgMemberGuard`) : nul ne
 * peut viser l'événement d'un autre en présentant la sienne.
 */
@ApiTags('Organisateur · mise en avant')
@Controller('organizer/events/:eventId/spotlight')
export class OrganizerSpotlightController {
  constructor(
    private readonly bookings: SpotlightBookingsService,
    private readonly receipts: SpotlightReceiptService,
    private readonly storage: StorageProvider,
  ) {}

  @Get()
  @RequirePermission('promo:manage')
  @ApiOperation({ summary: 'L’offre, le calendrier, l’avoir et les places de cet événement' })
  offer(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
  ): Promise<SpotlightOffer> {
    return this.bookings.offer(context, eventId);
  }

  @Post('bookings')
  @RequirePermission('promo:manage')
  @ApiOperation({ summary: 'Demander une place à la une' })
  create(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Body() body: CreateBookingDto,
  ): Promise<SpotlightBookingCreated> {
    return this.bookings.create(context, user.id, eventId, body);
  }

  @Post('bookings/:bookingId/payment')
  @RequirePermission('promo:manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ouvrir la fenêtre de paiement d’une place' })
  pay(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: PayBookingDto,
  ): Promise<PaymentState> {
    return this.bookings.pay(context, user.id, eventId, bookingId, body.method);
  }

  @Get('bookings/:bookingId/payments/:paymentId')
  @RequirePermission('promo:manage')
  @ApiOperation({ summary: 'État du paiement d’une place' })
  paymentState(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
    @Param('bookingId') bookingId: string,
    @Param('paymentId') paymentId: string,
  ): Promise<PaymentState> {
    return this.bookings.paymentState(context, eventId, bookingId, paymentId);
  }

  @Post('bookings/:bookingId/payments/:paymentId/confirm')
  @RequirePermission('promo:manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rapporter la transaction de la fenêtre — relue chez le prestataire' })
  confirm(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
    @Param('bookingId') bookingId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: ConfirmPaymentDto,
  ): Promise<PaymentState> {
    return this.bookings.confirmPayment(
      context,
      eventId,
      bookingId,
      paymentId,
      body.providerReference,
    );
  }

  @Post('bookings/:bookingId/cancel')
  @RequirePermission('promo:manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Annuler une place — les jours non commencés reviennent en avoir' })
  cancel(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<SpotlightBooking> {
    return this.bookings.cancel(context, user.id, eventId, bookingId);
  }

  @Get('bookings/:bookingId/receipt.pdf')
  @RequirePermission('promo:manage')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Reçu d’une place réglée' })
  async receipt(
    @CurrentOrg() context: OrgContext,
    @Param('eventId') eventId: string,
    @Param('bookingId') bookingId: string,
    @Res() response: Response,
  ): Promise<void> {
    const data = await this.bookings.receiptData(context, eventId, bookingId);
    const file = await this.receipts.render(data);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="recu-${data.booking.reference}.pdf"`,
    );
    response.send(file);
  }

  /** Ticket de dépôt direct d'une vidéo, rangée sous l'identifiant du membre. */
  @Post('video-ticket')
  @RequirePermission('promo:manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Obtenir un ticket de dépôt direct pour une vidéo' })
  async videoTicket(@CurrentUser() user: AuthenticatedUser): Promise<SpotlightVideoTicket> {
    const ticket = await this.storage.createVideoUploadTicket(user.id);

    if (!ticket) {
      throw new BadRequestException('Le dépôt de vidéo n’est pas disponible pour le moment.');
    }

    return ticket;
  }

  @Post('video')
  @RequirePermission('promo:manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Valider une vidéo déposée et obtenir ses adresses' })
  video(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StagedVideoDto,
  ): Promise<SpotlightVideo> {
    return this.storage.confirmVideo(body, user.id);
  }
}
