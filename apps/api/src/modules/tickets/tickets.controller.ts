import { Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ticketTabSchema, type Ticket, type TicketGroup } from '@nexakabi/contracts';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { TicketsService } from './tickets.service';
import { TicketSigningService } from './ticket-signing.service';
import { TicketPdfService } from './ticket-pdf.service';

/**
 * Billets du participant connecté.
 *
 * Première des trois portes d'accès à un billet. Les deux autres — le lien
 * public et le PDF — existent parce qu'un billet introuvable à la porte est un
 * échec produit, et que la redondance est ici une décision, pas un accident.
 */
@ApiTags('Mes billets')
@Controller('me/tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @ApiOperation({ summary: 'Billets, regroupés par événement' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tab') tab?: string,
  ): Promise<TicketGroup[]> {
    const parsed = ticketTabSchema.safeParse(tab);
    return this.tickets.listForUser(user.id, parsed.success ? parsed.data : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un billet et son QR' })
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Ticket> {
    return this.tickets.findForUser(user.id, id);
  }

  /**
   * Coupe les liens de partage déjà émis.
   *
   * Le QR ne change pas : il est signé, et le réémettre invaliderait un billet
   * déjà imprimé. Seul le lien de consultation est renouvelé.
   */
  @Post(':id/lien')
  @ApiOperation({
    summary: 'Renouveler le lien de partage',
    description:
      'L’ancien lien cesse immédiatement de fonctionner. À utiliser quand un ' +
      'lien a été transféré par erreur.',
  })
  async rotateLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Ticket> {
    return this.tickets.rotateAccessToken(user.id, id);
  }
}

/**
 * Accès public à un billet, par jeton.
 *
 * Deuxième porte : le lien reçu par WhatsApp ou SMS, consultable sans compte.
 * Le jeton est distinct du contenu du QR — partager le lien ne révèle donc pas
 * le billet signé, seulement sa page.
 */
@ApiTags('Billet public')
@Controller('t')
export class PublicTicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly signing: TicketSigningService,
    private readonly pdf: TicketPdfService,
  ) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Consulter un billet par son lien' })
  async findByToken(@Param('token') token: string): Promise<Ticket> {
    return this.tickets.findByAccessToken(token);
  }

  /**
   * Billet au format PDF.
   *
   * Quatrième chemin d'accès, et le seul qui fonctionne sans téléphone :
   * batterie vide dans la file, écran cassé la veille. Servi par le même jeton
   * que la page, donc accessible à qui détient le lien — et à personne d'autre.
   */
  @Public()
  @Get(':token/pdf')
  @Header('Cache-Control', 'private, max-age=3600')
  async pdfByToken(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const ticket = await this.tickets.findByAccessToken(token);
    const file = await this.pdf.render(ticket);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="billet-${ticket.reference}.pdf"`,
    );
    response.send(file);
  }

  /**
   * Clé publique de vérification d'un événement.
   *
   * Distribuée au contrôleur avec son carnet. Elle ne permet que de vérifier :
   * personne ne peut forger un billet avec elle. C'est ce qui rend le contrôle
   * possible hors ligne sans jamais confier de secret à un téléphone.
   */
  @Public()
  @Get('cles/:eventId')
  @ApiOperation({ summary: 'Clé publique de vérification d’un événement' })
  async publicKey(
    @Param('eventId') eventId: string,
  ): Promise<{ keyId: string; publicKey: string } | null> {
    return this.signing.findPublicKey(eventId);
  }
}
