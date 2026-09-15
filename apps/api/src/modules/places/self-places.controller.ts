import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { placeSearchQuerySchema, type PlaceDetails, type PlaceSuggestion } from '@nexakabi/contracts';
import { z } from 'zod';
import { PlacesService } from './places.service';

const sessionSchema = z.string().trim().min(8).max(64);

/**
 * Recherche de lieux pour son PROPRE profil — organisation ou compte.
 *
 * ── Pourquoi une route à part, hors de `organizer/places` ─────────────────
 * `organizer/places` exige d'appartenir à une organisation : c'est pensé pour
 * chercher le lieu d'un ÉVÉNEMENT, via `OrgMemberGuard`. Mais au moment de
 * CRÉER son organisation, l'utilisateur n'en a encore aucune — ce garde le
 * bloquerait avant même d'avoir commencé (« Aucune organisation indiquée »).
 *
 * Cette route ne demande qu'une session valide (garde global, comme le reste
 * de l'API) : chacun ne peut s'en servir que pour chercher SA PROPRE adresse,
 * jamais celle d'un tiers — il n'y a d'ailleurs rien d'autre à en faire, la
 * réponse ne contient que des lieux publics Google.
 */
@ApiTags('Lieux')
@Controller('places')
export class SelfPlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get('search')
  // Même plafond que `organizer/places` : la recherche coûte de l'argent à
  // chaque session, quel que soit qui la déclenche.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Suggestions de lieux au Bénin' })
  search(@Query() query: Record<string, string>): Promise<PlaceSuggestion[]> {
    const parsed = placeSearchQuerySchema.parse(query);
    return this.places.search(parsed.q, parsed.session);
  }

  @Get(':placeId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Détail et coordonnées d’un lieu' })
  details(
    @Param('placeId') placeId: string,
    @Query('session') session: string,
  ): Promise<PlaceDetails> {
    return this.places.details(placeId, sessionSchema.parse(session));
  }
}
