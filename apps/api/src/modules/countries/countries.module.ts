import { Global, Module } from '@nestjs/common';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';

/**
 * Pays.
 *
 * Global, parce que le pays intervient partout où de l'argent ou un numéro
 * circule — commandes, paiements, organisations, retraits — et qu'un service
 * de lecture de configuration n'a aucune raison d'être protégé par la
 * topologie des modules.
 */
@Global()
@Module({
  controllers: [CountriesController],
  providers: [CountriesService],
  exports: [CountriesService],
})
export class CountriesModule {}
