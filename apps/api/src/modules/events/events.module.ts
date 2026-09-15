import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { TicketsModule } from '../tickets/tickets.module';
import { DiscoveryController, OrganizerEventsController } from './events.controller';
import { DiscoveryService } from './discovery.service';
import { EventsService } from './events.service';

/**
 * Événements.
 *
 * Finance et billets sont importés pour une seule raison : l'annulation d'un
 * événement rembourse ses acheteurs et invalide ses billets, dans le même
 * mouvement que le changement d'état. Rien dans ces deux modules ne dépend
 * des événements en retour, le graphe reste sans cycle.
 */
@Module({
  imports: [FinanceModule, TicketsModule],
  controllers: [DiscoveryController, OrganizerEventsController],
  providers: [DiscoveryService, EventsService],
  exports: [DiscoveryService, EventsService],
})
export class EventsModule {}
