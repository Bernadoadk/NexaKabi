import { Module } from '@nestjs/common';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

/**
 * Suivi des organisateurs par les participants.
 *
 * L'annonce d'une publication aux abonnés ne vit pas ici mais dans
 * `EventNotifierService` : c'est une conséquence de la vie d'un événement, au
 * même titre qu'une annulation, et elle n'a besoin que de la table des suivis.
 */
@Module({
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
