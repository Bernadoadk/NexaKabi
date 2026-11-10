import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  recordSpotlightViewsSchema,
  type SpotlightClickTarget,
  type SpotlightFeed,
} from '@nexakabi/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { SpotlightsService } from './spotlights.service';

/**
 * La une, côté public.
 *
 * ── Pourquoi la mesure échappe à la limite de débit ─────────────────────────
 * Vues et clics arrivent par le serveur du site, qui relaie pour tous les
 * visiteurs depuis quelques adresses seulement : la limite par adresse IP les
 * compterait ensemble et finirait par refuser le catalogue lui-même. Le coût
 * d'un envoi est borné autrement — douze identifiants au plus, une requête SQL.
 */
@ApiTags('À la une')
@Controller('spotlights')
export class SpotlightsController {
  constructor(private readonly spotlights: SpotlightsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Les diapositives de la une, dans l’ordre' })
  feed(@Query('pays') countryCode?: string): Promise<SpotlightFeed> {
    return this.spotlights.feed(countryCode);
  }

  @Public()
  @SkipThrottle()
  @Post('views')
  @HttpCode(204)
  @ApiOperation({ summary: 'Compter les diapositives vues par une page' })
  async views(@Body() body: unknown): Promise<void> {
    await this.spotlights.recordViews(recordSpotlightViewsSchema.parse(body).ids);
  }

  @Public()
  @SkipThrottle()
  @Post(':id/click')
  @HttpCode(200)
  @ApiOperation({ summary: 'Compter un clic et dire où il mène' })
  click(@Param('id') id: string): Promise<SpotlightClickTarget> {
    return this.spotlights.recordClick(id);
  }
}
