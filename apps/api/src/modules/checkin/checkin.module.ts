import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { CheckInController, ScannerEventsController } from './checkin.controller';
import { CheckInService } from './checkin.service';
import { ManifestService } from './manifest.service';

@Module({
  imports: [TicketsModule],
  controllers: [ScannerEventsController, CheckInController],
  providers: [CheckInService, ManifestService],
  exports: [CheckInService, ManifestService],
})
export class CheckInModule {}
