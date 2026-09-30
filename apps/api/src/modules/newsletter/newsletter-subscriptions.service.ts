import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NEWSLETTER_SOURCE_LABELS,
  NEWSLETTER_SUBSCRIBER_STATUS_LABELS,
  buildPaginatedResult,
  type AccountNewsletter,
  type NewsletterSource,
  type NewsletterSubscriber,
  type NewsletterSubscribersQuery,
  type NewsletterTokenResult,
  type PaginatedResult,
} from '@nexakabi/contracts';
import { toCsv } from '../../common/csv';
import type { Env } from '../../config/env';
import { publicWebUrl } from '../../config/public-urls';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboundService } from '../notifications/outbound.service';
import { renderConfirmationEmail } from './newsletter-renderer';
import { generateNewsletterToken, maskEmail } from './newsletter-tokens';

/**
 * Délai minimal entre deux e-mails de confirmation vers une même adresse.
 *
 * Sans lui, le formulaire public deviendrait une machine à inonder la boîte de
 * quelqu'un : saisir son adresse cent fois lui enverrait cent messages, en
 * notre nom. La limite par adresse IP ne suffit pas — elle se contourne.
 */
const CONFIRMATION_COOLDOWN_MS = 10 * 60 * 1000;

/** Plafond d'un export : au-delà, ce n'est plus un export, c'est une copie de la base. */
const EXPORT_LIMIT = 50_000;

type SubscriberRow = Prisma.NewsletterSubscriberGetPayload<{
  include: { user: { select: { fullName: true } } };
}>;

/**
 * Abonnements à la newsletter : l'inscription, sa confirmation, le départ.
 *
 * ── Le double consentement, sans exception ─────────────────────────────────
 * Formulaire du site, étape d'inscription ou réglages du compte : toute
 * adresse reçoit d'abord un lien de confirmation, et rien d'autre tant qu'il
 * n'a pas été ouvert. Même un participant connecté — l'adresse de son compte
 * n'a jamais été vérifiée, et une faute de frappe inscrirait un inconnu.
 *
 * ── Ce qui n'est jamais révélé ──────────────────────────────────────────────
 * Le formulaire public répond la même chose qu'une adresse soit nouvelle, déjà
 * abonnée ou désabonnée : sinon, il dirait à n'importe qui si telle personne
 * reçoit notre newsletter.
 */
@Injectable()
export class NewsletterSubscriptionsService {
  private readonly logger = new Logger(NewsletterSubscriptionsService.name);
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: OutboundService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = publicWebUrl(config);
  }

  // ── Formulaire du site ────────────────────────────────────────────────────

  /** Inscription sans compte. Ne dit jamais si l'adresse était déjà connue. */
  async subscribePublic(email: string): Promise<void> {
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email } });

    if (existing?.status === 'ACTIVE') return;

    const subscriber = existing
      ? await this.prisma.newsletterSubscriber.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            // Une nouvelle demande est un nouveau consentement : sa date et
            // son origine remplacent les précédentes.
            consentAt: new Date(),
            source: existing.userId ? existing.source : 'WEBSITE',
            unsubscribedAt: null,
          },
        })
      : await this.prisma.newsletterSubscriber.create({
          data: {
            email,
            status: 'PENDING',
            source: 'WEBSITE',
            token: generateNewsletterToken(),
          },
        });

    await this.sendConfirmation(subscriber);
  }

  // ── Compte du participant ─────────────────────────────────────────────────

  async accountStatus(userId: string): Promise<AccountNewsletter> {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({
      where: { userId },
      select: { status: true, email: true },
    });

    return subscriber ?? { status: 'NONE', email: null };
  }

  /**
   * Abonne l'adresse du compte — depuis l'inscription ou les réglages.
   *
   * ── Une adresse, un abonnement ──────────────────────────────────────────
   * Si l'adresse est déjà abonnée depuis le formulaire du site, c'est CE
   * consentement qu'on rattache au compte : l'adresse n'est pas inscrite
   * deux fois. Si le compte a changé d'adresse, l'ancien abonnement est
   * détaché — il reste valable pour l'ancienne adresse, qui l'a confirmé — et
   * la nouvelle doit être confirmée à son tour.
   */
  async subscribeAccount(
    userId: string,
    source: Extract<NewsletterSource, 'SIGNUP' | 'ACCOUNT'>,
  ): Promise<AccountNewsletter> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      throw new BadRequestException(
        'Ajoute une adresse e-mail à ton compte pour recevoir la newsletter.',
      );
    }

    const email = user.email.toLowerCase();

    const [linked, byEmail] = await Promise.all([
      this.prisma.newsletterSubscriber.findUnique({ where: { userId } }),
      this.prisma.newsletterSubscriber.findUnique({ where: { email } }),
    ]);

    let subscriber = byEmail;

    if (linked && linked.email !== email) {
      await this.prisma.newsletterSubscriber.update({
        where: { id: linked.id },
        data: { userId: null },
      });
    } else if (linked) {
      subscriber = linked;
    }

    if (subscriber?.status === 'ACTIVE') {
      if (subscriber.userId !== userId) {
        await this.prisma.newsletterSubscriber.update({
          where: { id: subscriber.id },
          data: { userId },
        });
      }

      return { status: 'ACTIVE', email: subscriber.email };
    }

    subscriber = subscriber
      ? await this.prisma.newsletterSubscriber.update({
          where: { id: subscriber.id },
          data: {
            userId,
            status: 'PENDING',
            source,
            consentAt: new Date(),
            unsubscribedAt: null,
          },
        })
      : await this.prisma.newsletterSubscriber.create({
          data: {
            email,
            userId,
            status: 'PENDING',
            source,
            token: generateNewsletterToken(),
          },
        });

    await this.sendConfirmation(subscriber);

    return { status: 'PENDING', email: subscriber.email };
  }

  /** Retire le consentement du compte, confirmé ou non. */
  async unsubscribeAccount(userId: string): Promise<AccountNewsletter> {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({ where: { userId } });

    if (!subscriber) return { status: 'NONE', email: null };

    if (subscriber.status !== 'UNSUBSCRIBED') {
      await this.prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
      });
    }

    return { status: 'UNSUBSCRIBED', email: subscriber.email };
  }

  // ── Liens des e-mails ─────────────────────────────────────────────────────

  /** Ce qu'un lien désigne, pour que la page l'annonce avant d'agir. */
  async describeToken(token: string): Promise<NewsletterTokenResult> {
    const subscriber = await this.findByToken(token);
    return { status: subscriber.status, maskedEmail: maskEmail(subscriber.email) };
  }

  /**
   * Confirme une adresse.
   *
   * Un lien ouvert après un désabonnement ne réabonne PAS : il date d'avant
   * la décision de partir, et la dernière décision l'emporte.
   *
   * L'adresse est désormais prouvée : si c'est celle du compte lié, le compte
   * la tient pour vérifiée.
   */
  async confirm(token: string): Promise<NewsletterTokenResult> {
    const subscriber = await this.findByToken(token);

    if (subscriber.status === 'PENDING') {
      const now = new Date();

      await this.prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { status: 'ACTIVE', confirmedAt: now },
      });

      if (subscriber.userId) {
        await this.prisma.user.updateMany({
          where: { id: subscriber.userId, email: subscriber.email, emailVerifiedAt: null },
          data: { emailVerifiedAt: now },
        });
      }

      this.logger.log(`Newsletter : adresse confirmée (${maskEmail(subscriber.email)})`);
      return { status: 'ACTIVE', maskedEmail: maskEmail(subscriber.email) };
    }

    return { status: subscriber.status, maskedEmail: maskEmail(subscriber.email) };
  }

  /** Désabonne. Idempotent : un second clic ne change rien et ne se plaint pas. */
  async unsubscribe(token: string): Promise<NewsletterTokenResult> {
    const subscriber = await this.findByToken(token);

    if (subscriber.status !== 'UNSUBSCRIBED') {
      await this.prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
      });

      this.logger.log(`Newsletter : désabonnement (${maskEmail(subscriber.email)})`);
    }

    return { status: 'UNSUBSCRIBED', maskedEmail: maskEmail(subscriber.email) };
  }

  // ── Console ───────────────────────────────────────────────────────────────

  async list(query: NewsletterSubscribersQuery): Promise<PaginatedResult<NewsletterSubscriber>> {
    const where = subscriberWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);

    return buildPaginatedResult(rows.map(toSubscriber), total, query);
  }

  async exportCsv(query: NewsletterSubscribersQuery): Promise<string> {
    const rows = await this.prisma.newsletterSubscriber.findMany({
      where: subscriberWhere(query),
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
      include: { user: { select: { fullName: true } } },
    });

    return toCsv(
      ['Adresse', 'Statut', 'Origine', 'Compte', 'Inscrit le', 'Confirmé le', 'Désabonné le'],
      rows.map((row) => [
        row.email,
        NEWSLETTER_SUBSCRIBER_STATUS_LABELS[row.status],
        NEWSLETTER_SOURCE_LABELS[row.source],
        row.user?.fullName ?? '',
        row.consentAt.toISOString(),
        row.confirmedAt?.toISOString(),
        row.unsubscribedAt?.toISOString(),
      ]),
    );
  }

  /**
   * Désabonnement fait par l'administration — quand la personne le demande
   * par un autre canal (WhatsApp, téléphone) plutôt que par le lien.
   */
  async unsubscribeByAdmin(subscriberId: string, adminId: string): Promise<NewsletterSubscriber> {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({
      where: { id: subscriberId },
      include: { user: { select: { fullName: true } } },
    });

    if (!subscriber) throw new NotFoundException('Cet abonné n’existe pas.');

    if (subscriber.status === 'UNSUBSCRIBED') return toSubscriber(subscriber);

    const updated = await this.prisma.newsletterSubscriber.update({
      where: { id: subscriberId },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
      include: { user: { select: { fullName: true } } },
    });

    await this.audit.record({
      action: 'admin.newsletter.subscriber_unsubscribed',
      actorType: 'ADMIN',
      actorUserId: adminId,
      entityType: 'NewsletterSubscriber',
      entityId: subscriberId,
      changes: { from: subscriber.status, to: 'UNSUBSCRIBED' },
    });

    return toSubscriber(updated);
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  private async findByToken(token: string) {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({ where: { token } });

    if (!subscriber) {
      throw new NotFoundException(
        'Ce lien n’est pas valable. Il a peut-être été mal copié depuis l’e-mail.',
      );
    }

    return subscriber;
  }

  /**
   * Envoie le lien de confirmation — au plus une fois toutes les dix minutes
   * par adresse, quel que soit le nombre de demandes.
   */
  private async sendConfirmation(subscriber: {
    id: string;
    email: string;
    token: string;
    userId: string | null;
    confirmationSentAt: Date | null;
  }): Promise<void> {
    const now = Date.now();

    if (
      subscriber.confirmationSentAt &&
      now - subscriber.confirmationSentAt.getTime() < CONFIRMATION_COOLDOWN_MS
    ) {
      return;
    }

    const message = renderConfirmationEmail({
      confirmUrl: `${this.webUrl}/newsletter/confirmer?t=${encodeURIComponent(subscriber.token)}`,
    });

    const sent = await this.outbound.sendEmail({
      userId: subscriber.userId ?? undefined,
      to: subscriber.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (sent) {
      await this.prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { confirmationSentAt: new Date(now) },
      });
    }
  }
}

function subscriberWhere(query: NewsletterSubscribersQuery): Prisma.NewsletterSubscriberWhereInput {
  return {
    ...(query.statut ? { status: query.statut } : {}),
    ...(query.q
      ? {
          OR: [
            { email: { contains: query.q.toLowerCase() } },
            { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

function toSubscriber(row: SubscriberRow): NewsletterSubscriber {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    source: row.source,
    userName: row.user?.fullName || null,
    createdAt: row.consentAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    unsubscribedAt: row.unsubscribedAt?.toISOString() ?? null,
  };
}
