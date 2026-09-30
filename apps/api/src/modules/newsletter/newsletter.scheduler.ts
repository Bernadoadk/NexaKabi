import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NewsletterSenderService } from './newsletter-sender.service';

/**
 * Passage d'envoi de la newsletter, chaque minute.
 *
 * Il ne fait rien la plupart du temps : une requête qui ne trouve aucune
 * campagne en cours ni programmée. Quand une campagne part, il en envoie un
 * lot par minute jusqu'à la dernière adresse.
 */
@Injectable()
export class NewsletterScheduler {
  private readonly logger = new Logger(NewsletterScheduler.name);

  constructor(private readonly sender: NewsletterSenderService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async send(): Promise<void> {
    // Sous verrou, comme tout passage : voir `NewsletterSenderService.runExclusively`.
    const report = await this.sender.runExclusively();

    if (report && (report.started > 0 || report.sent > 0 || report.failed > 0)) {
      this.logger.log(
        `Newsletter : ${report.started} campagne(s) lancée(s), ${report.sent} envoi(s), ${report.failed} échec(s)`,
      );
    }
  }
}
