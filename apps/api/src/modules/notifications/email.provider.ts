import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../config/env';

export interface EmailAttachment {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType: string;
}

export interface SendEmailInput {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  /** Repli texte brut — certains clients de messagerie n'affichent que lui. */
  readonly text: string;
  readonly attachments?: readonly EmailAttachment[];
}

/**
 * Envoi des e-mails — billets, reçus, alertes.
 *
 * Même principe que `SmsProvider` : une abstraction étroite, une
 * implémentation de développement qui n'envoie rien réellement, et une
 * implémentation réelle branchée par variable d'environnement.
 */
export abstract class EmailProvider {
  abstract readonly code: string;
  abstract send(input: SendEmailInput): Promise<void>;
}

/**
 * Fournisseur de développement : écrit dans les journaux plutôt que
 * d'envoyer. Contrairement à `ConsoleSmsProvider`, celui-ci reste autorisé en
 * production — un e-mail non envoyé est moins critique qu'un code de
 * connexion qui ne part pas, et certaines installations n'ont simplement pas
 * encore de SMTP configuré.
 */
@Injectable()
export class ConsoleEmailProvider extends EmailProvider {
  readonly code = 'console';
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async send({ to, subject, attachments }: SendEmailInput): Promise<void> {
    const attachmentNote =
      attachments && attachments.length > 0
        ? ` (${attachments.length} pièce(s) jointe(s) : ${attachments.map((a) => a.filename).join(', ')})`
        : '';

    this.logger.log(`[EMAIL] → ${to} : ${subject}${attachmentNote}`);
    return Promise.resolve();
  }
}

/**
 * SMTP réel, via `nodemailer`. Fonctionne avec n'importe quel serveur SMTP
 * standard — Gmail y compris, avec un mot de passe d'application (jamais le
 * mot de passe du compte : https://myaccount.google.com/apppasswords).
 */
@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  readonly code = 'smtp';
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly logger = new Logger(SmtpEmailProvider.name);

  constructor(config: ConfigService<Env, true>) {
    super();

    const host = config.get('SMTP_HOST', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    const password = config.get('SMTP_PASSWORD', { infer: true });

    if (!host || !user || !password) {
      throw new Error(
        'EMAIL_PROVIDER=smtp exige SMTP_HOST, SMTP_USER et SMTP_PASSWORD. Pour Gmail : ' +
          'smtp.gmail.com, ton adresse Gmail, et un mot de passe d’application généré sur ' +
          'https://myaccount.google.com/apppasswords (la validation en deux étapes doit être activée).',
      );
    }

    this.from = config.get('SMTP_FROM', { infer: true });

    this.transporter = createTransport({
      host,
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth: { user, pass: password },
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    this.logger.log(`[SMTP] → ${input.to} : ${input.subject}`);
  }
}
