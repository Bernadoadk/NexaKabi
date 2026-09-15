import { Module } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { SelfPlacesController } from './self-places.controller';
import { PlacesService } from './places.service';

@Module({
  controllers: [PlacesController, SelfPlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
