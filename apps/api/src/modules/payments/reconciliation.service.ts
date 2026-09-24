import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { PaymentProviderCode } from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ADVISORY_LOCKS, AdvisoryLockService } from '../../infra/scheduling/advisory-lock.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './provider.registry';

/**
 * Délai avant la première interrogation.
 *
 * Trop court, on harcèle l'opérateur pendant que le client compose son code.
 * Trop long, un webhook perdu laisse un acheteur payé sans billet.
 */
const FIRST_POLL_DELAY_SECONDS = 45;

/** Nombre de paiements interrogés par passage. Borne la charge sur l'opérateur. */
const POLL_BATCH_SIZE = 50;

/**
 * Âge au-delà duquel une notification orpheline n'est plus reprise.
 *
 * Un orphelin légitime — le prestataire a notifié avant que notre initiation
 * soit validée — retrouve son paiement en quelques secondes. Passé trois
 * jours, celui qui n'a toujours rien trouvé ne le trouvera plus : c'est une
 * transaction que nous ne connaissons pas, et elle relève d'un examen humain.
 */
const ORPHAN_WEBHOOK_MAX_AGE_HOURS = 72;

export interface ReconciliationReport {
  readonly inspected: number;
  readonly recovered: number;
  readonly expired: number;
  readonly orphanWebhooks: number;
}

/**
 * Réconciliation des paiements.
 *
 * Part d'un constat : **un webhook se perd**. Réseau, panne côté opérateur,
 * redéploiement au mauvais moment. Sans rattrapage, le client est débité et
 * n'a pas de billet — c'est la pire panne possible pour ce produit, parce
 * qu'elle est silencieuse et qu'elle se découvre à la porte de l'événement.
 *
 * Deux passages, à deux rythmes :
 *   · toutes les minutes, les paiements récents encore en attente ;
 *   · chaque nuit, un balayage complet des écarts et des webhooks orphelins.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §6.5.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    private readonly locks: AdvisoryLockService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  /** Libère les réservations arrivées à échéance. */
  @Cron(CronExpression.EVERY_MINUTE)
  async releaseExpiredOrders(): Promise<void> {
    await this.locks.runExclusively(ADVISORY_LOCKS.releaseExpiredOrders, async () => {
      await this.orders.releaseExpired();
    });
  }

  /** Interroge les opérateurs sur les paiements restés en attente. */
  @Cron(CronExpression.EVERY_MINUTE)
  async pollPendingPayments(): Promise<void> {
    await this.locks.runExclusively(ADVISORY_LOCKS.reconcilePayments, async () => {
      const report = await this.reconcile();

      if (report.recovered > 0 || report.expired > 0) {
        this.logger.log(
          `Réconciliation : ${report.recovered} rattrapé(s), ${report.expired} expiré(s) sur ${report.inspected} inspecté(s)`,
        );
      }
    });
  }

  /**
   * Balayage nocturne.
   *
   * Reprend en plus les webhooks orphelins : ceux arrivés avant que notre
   * propre initiation soit enregistrée, dont le paiement existe désormais.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightlySweep(): Promise<void> {
    await this.locks.runExclusively(ADVISORY_LOCKS.reconcilePayments, async () => {
      const report = await this.reconcile({ maxAgeHours: 72 });
      this.logger.log(
        `Balayage nocturne : ${report.inspected} paiement(s), ${report.recovered} rattrapé(s), ` +
          `${report.expired} expiré(s), ${report.orphanWebhooks} webhook(s) orphelin(s) repris`,
      );
    });
  }

  /**
   * Exécute une passe de réconciliation.
   *
   * Exposée publiquement : elle est déclenchable à la main depuis
   * l'administration quand un opérateur signale un incident.
   */
  async reconcile({ maxAgeHours = 24 } = {}): Promise<ReconciliationReport> {
    const now = Date.now();
    const notBefore = new Date(now - maxAgeHours * 60 * 60 * 1000);
    const olderThan = new Date(now - FIRST_POLL_DELAY_SECONDS * 1000);

    const pending = await this.prisma.payment.findMany({
      where: {
        status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
        providerReference: { not: null },
        initiatedAt: { gte: notBefore, lte: olderThan },
      },
      select: { id: true, status: true },
      orderBy: { initiatedAt: 'asc' },
      take: POLL_BATCH_SIZE,
    });

    let recovered = 0;
    let expired = 0;

    for (const payment of pending) {
      const changed = await this.payments.pollProvider(payment.id);

      if (!changed) continue;

      const after = await this.prisma.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });

      if (after?.status === 'SUCCEEDED') recovered += 1;
      if (after?.status === 'EXPIRED') expired += 1;
    }

    /**
     * Les paiements sans référence de prestataire, arrivés à échéance.
     *
     * Une fenêtre de paiement ouverte puis abandonnée ne reçoit jamais de
     * référence : il n'y a rien à interroger, et le balayage ci-dessus ne la
     * voit pas. Sans ce second passage, elle resterait « en attente » pour
     * toujours — et la commande avec, aux yeux de l'acheteur.
     */
    const overdue = await this.prisma.payment.findMany({
      where: {
        status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
        providerReference: null,
        expiresAt: { lt: new Date(now) },
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: POLL_BATCH_SIZE,
    });

    for (const payment of overdue) {
      if (await this.payments.expireIfOverdue(payment.id)) expired += 1;
    }

    const orphanWebhooks = await this.replayOrphanWebhooks();

    return { inspected: pending.length + overdue.length, recovered, expired, orphanWebhooks };
  }

  /**
   * Reprend les webhooks reçus sans paiement correspondant.
   *
   * Cas réel : l'opérateur notifie plus vite que notre transaction d'initiation
   * ne se valide. La ligne est conservée en `RECEIVED` ; ici, on la rejoue.
   */
  private async replayOrphanWebhooks(): Promise<number> {
    /**
     * ── Pourquoi clore les plus vieux, et commencer par les plus récents ────
     * Une notification qui ne trouve jamais son paiement restait `RECEIVED`
     * pour toujours. La passe ne lisant que les cinquante plus anciennes, il
     * suffisait de cinquante notifications étrangères — un essai lancé depuis
     * le tableau de bord du prestataire, par exemple — pour que plus aucune
     * autre ne soit jamais reprise, sans le moindre signal.
     *
     * Les vieilles sont donc closes, avec un motif qui dit quoi en faire ; et
     * les récentes passent d'abord, parce que ce sont elles qui ont une chance
     * de retrouver leur paiement.
     */
    const expiredBefore = new Date(Date.now() - ORPHAN_WEBHOOK_MAX_AGE_HOURS * 60 * 60 * 1000);

    const expired = await this.prisma.webhookEvent.updateMany({
      where: { status: 'RECEIVED', paymentId: null, createdAt: { lt: expiredBefore } },
      data: {
        status: 'FAILED',
        error: `Aucun paiement ne correspond après ${ORPHAN_WEBHOOK_MAX_AGE_HOURS} h : transaction inconnue de Nexa-Kabi, à examiner.`,
      },
    });

    if (expired.count > 0) {
      this.logger.warn(
        `${expired.count} notification(s) sans paiement depuis ${ORPHAN_WEBHOOK_MAX_AGE_HOURS} h — closes, à examiner`,
      );
    }

    const orphans = await this.prisma.webhookEvent.findMany({
      where: { status: 'RECEIVED', paymentId: null },
      orderBy: { createdAt: 'desc' },
      take: POLL_BATCH_SIZE,
    });

    let replayed = 0;

    for (const orphan of orphans) {
      const providerReference = this.referenceOf(orphan.providerCode, orphan.rawBody);
      const merchantReference = this.merchantReferenceOf(orphan.providerCode, orphan.rawBody);

      if (!providerReference && !merchantReference) {
        await this.prisma.webhookEvent.update({
          where: { id: orphan.id },
          data: { status: 'FAILED', error: 'Référence opérateur illisible' },
        });
        continue;
      }

      // Par la référence du prestataire, ou par NOTRE identifiant quand il le
      // renvoie : une transaction faite dans la fenêtre de paiement n'est
      // connue de nous que par lui tant que la page ne l'a pas transmise.
      const payment = await this.prisma.payment.findFirst({
        where: {
          providerCode: orphan.providerCode,
          OR: [
            ...(providerReference ? [{ providerReference }] : []),
            ...(merchantReference ? [{ id: merchantReference }] : []),
          ],
        },
        select: { id: true },
      });

      if (!payment) continue;

      // Le paiement existe désormais : on relit la transaction chez le
      // prestataire plutôt que de rejouer un corps dont l'authentification a
      // déjà été consommée — c'est la lecture qui fait foi.
      if (providerReference) {
        await this.payments.reconcileTransaction(payment.id, providerReference);
      } else {
        await this.payments.pollProvider(payment.id);
      }

      await this.prisma.webhookEvent.update({
        where: { id: orphan.id },
        data: { status: 'PROCESSED', paymentId: payment.id, processedAt: new Date(), error: null },
      });

      replayed += 1;
    }

    return replayed;
  }

  /**
   * Retrouve la référence du prestataire dans un corps conservé.
   *
   * ── Pourquoi le prestataire doit répondre lui-même ──────────────────────
   * Chacun nomme cette référence à sa façon : `id` chez Bictorys,
   * `transactionId` chez Kkiapay, `providerReference` chez le simulateur.
   * Chercher un seul nom ici revenait à ne retrouver QUE les notifications du
   * simulateur — les autres finissaient en `FAILED`, et l'acheteur payé
   * restait sans billet, silencieusement, dans le cas précis que ce filet
   * doit rattraper.
   *
   * Le repli sur `providerReference` couvre le simulateur et tout prestataire
   * qui n'aurait pas déclaré la méthode.
   */
  private referenceOf(providerCode: string, rawBody: string): string | null {
    const code = providerCode as PaymentProviderCode;

    if (this.registry.has(code)) {
      const provider = this.registry.get(code);

      if (provider.extractProviderReference) {
        return provider.extractProviderReference(rawBody);
      }
    }

    try {
      const parsed = JSON.parse(rawBody) as { providerReference?: unknown };
      return typeof parsed.providerReference === 'string' ? parsed.providerReference : null;
    } catch {
      return null;
    }
  }

  /** Notre identifiant de paiement dans un corps conservé, si le prestataire le renvoie. */
  private merchantReferenceOf(providerCode: string, rawBody: string): string | null {
    const code = providerCode as PaymentProviderCode;

    if (!this.registry.has(code)) return null;

    return this.registry.get(code).extractMerchantReference?.(rawBody) ?? null;
  }
}
