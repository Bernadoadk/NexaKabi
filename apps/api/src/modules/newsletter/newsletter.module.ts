import { Module } from '@nestjs/common';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';
import { NewsletterSenderService } from './newsletter-sender.service';
import { NewsletterSubscriptionsService } from './newsletter-subscriptions.service';
import { AccountNewsletterController, NewsletterController } from './newsletter.controller';
import { NewsletterScheduler } from './newsletter.scheduler';

/**
 * Newsletter : abonnés, campagnes et leur envoi.
 *
 * Les routes de la console vivent dans `AdminModule`, derrière son garde de
 * session — ce module leur fournit les services, rien d'autre.
 */
@Module({
  controllers: [NewsletterController, AccountNewsletterController],
  providers: [
    NewsletterSubscriptionsService,
    NewsletterCampaignsService,
    NewsletterSenderService,
    NewsletterScheduler,
  ],
  exports: [NewsletterSubscriptionsService, NewsletterCampaignsService, NewsletterScheduler],
})
export class NewsletterModule {}
