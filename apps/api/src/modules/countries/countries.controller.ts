import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Country } from '@nexakabi/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { CountriesService } from './countries.service';

/**
 * Pays ouverts — ce que le public et les organisateurs peuvent choisir.
 *
 * Les pays fermés n'apparaissent pas : proposer un pays où aucun moyen de
 * paiement ne fonctionne ferait échouer une inscription au moment le plus
 * coûteux.
 */
@ApiTags('Pays')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Pays ouverts sur la plateforme' })
  list(): Promise<Country[]> {
    return this.countries.listActive();
  }
}
