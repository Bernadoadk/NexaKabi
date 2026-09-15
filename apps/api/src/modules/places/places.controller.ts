import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  geocodeQuerySchema,
  placeSearchQuerySchema,
  type GeocodeResult,
  type PlaceDetails,
  type PlaceSuggestion,
} from '@nexakabi/contracts';
import { z } from 'zod';
import { RequirePermission } from '../organizations/decorators/require-permission.decorator';
import { PlacesService } from './places.service';

const sessionSchema = z.string().trim().min(8).max(64);

/**
 * Recherche de lieux, pour l'assistant de création d'événement.
 *
 * ── Qui peut chercher ─────────────────────────────────────────────────────
 * Quiconque peut modifier un événement : c'est l'étape « Lieu » qui appelle.
 * La recherche coûte de l'argent à chaque session ; la réserver aux membres
 * habilités et la plafonner évite qu'un compte quelconque ne consomme le
 * quota de tout le monde.
 */
@ApiTags('Organisateur · lieux')
@Controller('organizer/places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get('status')
  @RequirePermission('event:update')
  @ApiOperation({ summary: 'La recherche de lieux est-elle disponible ?' })
  status(): { enabled: boolean } {
    return { enabled: this.places.enabled };
  }

  @Get('search')
  @RequirePermission('event:update')
  // Une frappe toutes les 300 ms au plus côté client ; 60 par minute laisse
  // de la marge à une recherche hésitante sans ouvrir une pompe à quota.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Suggestions de lieux au Bénin' })
  search(@Query() query: Record<string, string>): Promise<PlaceSuggestion[]> {
    const parsed = placeSearchQuerySchema.parse(query);
    return this.places.search(parsed.q, parsed.session);
  }

  @Get('geocode')
  @RequirePermission('event:update')
  // Un appel par clic sur « Localiser », jamais à la frappe : le plafond est
  // là pour un doigt qui insiste, pas pour une saisie normale.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Position d’une adresse saisie à la main' })
  geocode(@Query() query: Record<string, string>): Promise<GeocodeResult> {
    return this.places.geocode(geocodeQuerySchema.parse(query).q);
  }

  @Get(':placeId')
  @RequirePermission('event:update')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Détail et coordonnées d’un lieu' })
  details(
    @Param('placeId') placeId: string,
    @Query('session') session: string,
  ): Promise<PlaceDetails> {
    return this.places.details(placeId, sessionSchema.parse(session));
  }
}
