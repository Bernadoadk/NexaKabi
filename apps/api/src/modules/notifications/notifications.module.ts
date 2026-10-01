import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleEmailProvider, EmailProvider, SmtpEmailProvider } from './email.provider';
import { EventNotifierService } from './event-notifier.service';
import { InterestsService } from './interests.service';
import {
  InterestsController,
  NotificationsController,
  PushController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsScheduler } from './notifications.scheduler';
import { OrganizationAudienceService } from './organization-audience.service';
import { OutboundService } from './outbound.service';
import { PlatformSettingsService } from './platform-settings.service';
import { PushService } from './push.service';
import { RecommendationsService } from './recommendations.service';
import { RemindersService } from './reminders.service';
import { SalesNotifierService } from './sales-notifier.service';
import { ConsoleSmsProvider, SmsProvider } from './sms.provider';
import type { Env } from '../../config/env';

/**
 * Notifications sortantes et centre du participant.
 *
 * Global : les commandes, les paiements et les événements y écrivent depuis
 * leurs propres transactions. En faire un module importé partout obligerait à
 * l'ajouter à chaque `imports` pour un service qui n'a aucun état partagé.
 */
@Global()
@Module({
  controllers: [NotificationsController, InterestsController, PushController],
  providers: [
    NotificationsService,
    EventNotifierService,
    OrganizationAudienceService,
    SalesNotifierService,
    OutboundService,
    RemindersService,
    RecommendationsService,
    InterestsService,
    PushService,
    PlatformSettingsService,
    NotificationsScheduler,
    {
      provide: SmsProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): SmsProvider => {
        const provider = config.get('SMS_PROVIDER', { infer: true });

        switch (provider) {
          case 'console':
            return new ConsoleSmsProvider(config);
          default:
            throw new Error(`Fournisseur SMS inconnu : ${String(provider)}`);
        }
      },
    },
    {
      provide: EmailProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailProvider => {
        const provider = config.get('EMAIL_PROVIDER', { infer: true });

        switch (provider) {
          case 'console':
            return new ConsoleEmailProvider();
          case 'smtp':
            return new SmtpEmailProvider(config);
          default:
            throw new Error(`Fournisseur e-mail inconnu : ${String(provider)}`);
        }
      },
    },
  ],
  exports: [
    SmsProvider,
    EmailProvider,
    NotificationsService,
    EventNotifierService,
    OrganizationAudienceService,
    SalesNotifierService,
    RemindersService,
    RecommendationsService,
    OutboundService,
    PushService,
    PlatformSettingsService,
    NotificationsScheduler,
  ],
})
export class NotificationsModule {}
