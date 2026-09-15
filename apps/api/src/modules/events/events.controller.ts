import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createEventSchema,
  discoveryQuerySchema,
  ticketTypeInputSchema,
  updateEventSchema,
  type EventDetail,
  type EventMapPin,
  type EventSummary,
  type PaginatedResult,
} from '@nexakabi/contracts';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { CurrentOrg } from '../organizations/decorators/current-org.decorator';
import { RequirePermission } from '../organizations/decorators/require-permission.decorator';
import type { OrgContext } from '../organizations/guards/org-member.guard';
import { DiscoveryService } from './discovery.service';
import { EventsService } from './events.service';
import { CancelEventDto, CreateEventDto, TicketTypeDto, UpdateEventDto } from './dto/events.dto';

/**
 * Découverte publique.
 *
 * Toutes les routes sont accessibles sans compte : c'est ce qui permet à un lien
 * WhatsApp d'ouvrir directement une page événement, sans mur d'inscription.
 */
@ApiTags('Découverte')
@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Public()
  @Get('events')
  @ApiOperation({ summary: 'Catalogue filtrable' })
  search(@Query() query: Record<string, string>): Promise<PaginatedResult<EventSummary>> {
    return this.discovery.search(discoveryQuerySchema.parse(query));
  }

  @Public()
  @Get('events/home')
  @ApiOperation({ summary: "Sections éditorialisées de l'accueil" })
  home(@Query('ville') city?: string) {
    return this.discovery.homeSections(city);
  }

  @Public()
  @Get('events/map')
  @ApiOperation({ summary: 'Événements à venir, localisés, pour la carte' })
  mapPins(): Promise<EventMapPin[]> {
    return this.discovery.mapPins();
  }

  @Public()
  @Get('events/:slug')
  @ApiOperation({
    summary: "Page d'un événement",
    description:
      'Un événement privé reste accessible par son lien : seul son référencement lui est refusé.',
  })
  findBySlug(@Param('slug') slug: string): Promise<EventDetail> {
    return this.discovery.findBySlug(slug);
  }

  @Public()
  @Get('organizations/:slug/public')
  @ApiOperation({ summary: "Page publique d'un organisateur" })
  organizationPage(@Param('slug') slug: string) {
    return this.discovery.findByOrganization(slug);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Catégories actives' })
  categories() {
    return this.discovery.listCategories();
  }

  @Public()
  @Get('cities')
  @ApiOperation({ summary: 'Villes actives' })
  cities() {
    return this.discovery.listCities();
  }

  @Public()
  @Get('sitemap/events')
  @ApiOperation({ summary: 'Slugs publiés, pour le plan du site' })
  sitemap() {
    return this.discovery.listPublishedSlugs();
  }
}

/**
 * Événements, côté organisateur.
 *
 * L'assistant enregistre étape par étape : les contrôles de cohérence ne
 * s'appliquent qu'à la publication, pas à chaque sauvegarde de brouillon.
 */
@ApiTags('Organisateur · événements')
@Controller('organizer/events')
export class OrganizerEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @RequirePermission('event:read')
  @ApiOperation({ summary: 'Mes événements' })
  list(@CurrentOrg() context: OrgContext): Promise<EventSummary[]> {
    return this.events.list(context);
  }

  @Post()
  @RequirePermission('event:create')
  @ApiOperation({
    summary: 'Créer un brouillon',
    description: "Seul le titre est exigé : l'assistant complète le reste étape par étape.",
  })
  create(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateEventDto,
  ): Promise<EventDetail> {
    return this.events.create(context, user.id, createEventSchema.parse(body));
  }

  @Get(':id')
  @RequirePermission('event:read')
  @ApiOperation({ summary: "Détail d'un événement" })
  findById(@CurrentOrg() context: OrgContext, @Param('id') id: string): Promise<EventDetail> {
    return this.events.findById(context, id);
  }

  @Patch(':id')
  @RequirePermission('event:update')
  @ApiOperation({ summary: 'Enregistrer une étape de l’assistant' })
  update(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateEventDto,
  ): Promise<EventDetail> {
    return this.events.update(context, user.id, id, updateEventSchema.parse(body));
  }

  @Get(':id/readiness')
  @RequirePermission('event:read')
  @ApiOperation({
    summary: 'Contrôles restants avant publication',
    description: 'Renvoie tout ce qui manque, pas seulement le premier manque.',
  })
  async readiness(
    @CurrentOrg() context: OrgContext,
    @Param('id') id: string,
  ): Promise<{ missing: string[] }> {
    return { missing: await this.events.checkReadiness(context, id) };
  }

  @Post(':id/publish')
  @RequirePermission('event:publish')
  @ApiOperation({
    summary: 'Publier',
    description:
      'Mise en ligne immédiate pour un organisateur vérifié et établi, revue pour ' +
      'un premier événement.',
  })
  publish(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.events.publish(context, user.id, id);
  }

  @Post(':id/unpublish')
  @RequirePermission('event:publish')
  @ApiOperation({
    summary: 'Dépublier — retour au brouillon',
    description:
      'Possible tant qu’aucun billet n’a été vendu. Au-delà, seule l’annulation retire un événement.',
  })
  unpublish(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EventDetail> {
    return this.events.unpublish(context, user.id, id);
  }

  @Delete(':id')
  @RequirePermission('event:cancel')
  @ApiOperation({
    summary: 'Supprimer un événement',
    description:
      'Suppression logique. Refusée pour un événement en ligne qui a vendu : il faut l’annuler d’abord.',
  })
  async remove(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    await this.events.remove(context, user.id, id);
    return { deleted: true };
  }

  @Post(':id/cancel')
  @RequirePermission('event:cancel')
  @ApiOperation({ summary: 'Annuler un événement' })
  cancel(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: CancelEventDto,
  ): Promise<EventDetail> {
    return this.events.cancel(context, user.id, id, body.reason);
  }

  // ── Catégories de billets ─────────────────────────────────────────────────

  @Post(':id/ticket-types')
  @RequirePermission('ticket_type:manage')
  @ApiOperation({ summary: 'Ajouter une catégorie de billet' })
  addTicketType(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: TicketTypeDto,
  ): Promise<EventDetail> {
    return this.events.addTicketType(context, user.id, id, ticketTypeInputSchema.parse(body));
  }

  @Patch(':id/ticket-types/:ticketTypeId')
  @RequirePermission('ticket_type:manage')
  @ApiOperation({ summary: 'Modifier une catégorie de billet' })
  updateTicketType(
    @CurrentOrg() context: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('ticketTypeId') ticketTypeId: string,
    @Body() body: TicketTypeDto,
  ): Promise<EventDetail> {
    return this.events.updateTicketType(
      context,
      user.id,
      id,
      ticketTypeId,
      ticketTypeInputSchema.parse(body),
    );
  }

  @Delete(':id/ticket-types/:ticketTypeId')
  @RequirePermission('ticket_type:manage')
  @ApiOperation({ summary: 'Supprimer une catégorie de billet' })
  removeTicketType(
    @CurrentOrg() context: OrgContext,
    @Param('id') id: string,
    @Param('ticketTypeId') ticketTypeId: string,
  ): Promise<EventDetail> {
    return this.events.removeTicketType(context, id, ticketTypeId);
  }
}
