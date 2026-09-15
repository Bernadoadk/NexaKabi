import { Module } from '@nestjs/common';
import { TicketsController, PublicTicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketSigningService } from './ticket-signing.service';
import { TicketPdfService } from './ticket-pdf.service';
import { TicketEmailService } from './ticket-email.service';

/**
 * Billets.
 *
 * `TicketsService` est exporté pour être appelé DANS la transaction de
 * confirmation de paiement, jamais après : voir la règle d'or du service.
 *
 * `TicketEmailService` n'est PAS exporté : personne ne l'appelle
 * directement, il s'abonne à `order.paid` (voir sa propre documentation) et
 * n'a besoin d'être qu'un provider connu de Nest pour que l'abonnement
 * s'enregistre.
 */
@Module({
  controllers: [TicketsController, PublicTicketsController],
  providers: [TicketsService, TicketSigningService, TicketPdfService, TicketEmailService],
  exports: [TicketsService, TicketSigningService, TicketPdfService],
})
export class TicketsModule {}
