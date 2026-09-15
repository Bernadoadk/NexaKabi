import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_COMMISSION_POLICY,
  LEDGER_ENTRY_LABELS,
  isValidLedgerAmount,
  planRelease,
  resolveHoldTier,
  type Balance,
  type BalanceState,
  type LedgerEntry,
  type LedgerEntryType,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export interface WriteEntryInput {
  readonly organizationId: string;
  readonly type: LedgerEntryType;
  readonly amount: number;
  readonly description: string;
  readonly balanceState?: BalanceState;
  readonly availableAt?: Date | null;
  readonly eventId?: string;
  readonly orderId?: string;
  readonly paymentId?: string;
  readonly payoutId?: string;
  readonly refundId?: string;
  readonly metadata?: Prisma.InputJsonValue;
}

/**
 * Grand livre.
 *
 * ── Ce que ce service ne fait PAS ───────────────────────────────────────────
 * Il ne met jamais à jour une écriture, et n'en supprime aucune. La base
 * l'interdit par des déclencheurs, mais l'intention doit être visible ici
 * aussi : toute méthode publique de ce fichier n'ajoute que des lignes.
 *
 * ── Pourquoi le solde n'est pas un champ ────────────────────────────────────
 * Un compteur `balance` serait plus rapide à lire, et faux le jour où deux
 * écritures concurrentes le mettent à jour. Surtout, il serait INEXPLICABLE :
 * on saurait combien, jamais pourquoi. Un organisateur qui conteste son solde a
 * droit au détail, ligne par ligne.
 *
 * Voir docs/DATABASE_PROPOSAL.md §8.1.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Écrit une ligne au grand livre.
   *
   * Prend une transaction : une écriture financière n'a de sens qu'avec le fait
   * qui la produit. Une commission enregistrée sans sa vente, ou l'inverse,
   * rendrait le solde faux jusqu'à ce que quelqu'un s'en aperçoive.
   */
  async write(tx: Prisma.TransactionClient, input: WriteEntryInput): Promise<void> {
    if (!isValidLedgerAmount(input.type, input.amount)) {
      // Filet applicatif doublé d'une contrainte en base. Le signe d'une
      // écriture ne se devine pas à la lecture d'un solde : une erreur ici
      // resterait invisible pendant des mois.
      throw new BadRequestException(
        `Montant incohérent pour une écriture ${input.type} : ${input.amount}.`,
      );
    }

    await tx.ledgerEntry.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        amount: input.amount,
        balanceState: input.balanceState ?? 'AVAILABLE',
        availableAt: input.availableAt ?? null,
        eventId: input.eventId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        payoutId: input.payoutId,
        refundId: input.refundId,
        description: input.description,
        metadata: input.metadata,
      },
    });
  }

  /**
   * Enregistre la recette d'une commande encaissée.
   *
   * Trois écritures, et c'est délibéré : la vente brute, la commission, les
   * frais opérateur. Les fusionner en un seul « net » ferait gagner deux lignes
   * et perdre toute capacité d'expliquer un montant à un organisateur qui
   * demande pourquoi il ne reçoit pas ce qu'il a vendu.
   */
  async recordSale(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      eventId: string;
      orderId: string;
      paymentId: string;
      orderReference: string;
      grossAmount: number;
      platformFeeAmount: number;
      providerFeeAmount: number;
      isVerified: boolean;
      completedEventsCount: number;
      eventEndsAt: Date;
    },
  ): Promise<void> {
    const tier = resolveHoldTier({
      isVerified: input.isVerified,
      completedEventsCount: input.completedEventsCount,
    });

    const netAmount = input.grossAmount - input.platformFeeAmount - input.providerFeeAmount;
    const plan = planRelease({ netAmount, tier, eventEndsAt: input.eventEndsAt });

    /**
     * Les trois écritures partagent le même état de blocage.
     *
     * Bloquer la vente mais pas la commission donnerait un solde disponible
     * NÉGATIF sur un organisateur au palier 0 : il devrait de l'argent avant
     * d'en avoir reçu. Les trois lignes suivent donc le même sort, et c'est le
     * NET qui détermine la répartition entre poches.
     */
    const held = plan.heldAmount > 0;
    const state: BalanceState = held && plan.immediateAmount === 0 ? 'PENDING' : 'AVAILABLE';
    const availableAt = state === 'PENDING' ? plan.availableAt : null;

    await this.write(tx, {
      organizationId: input.organizationId,
      type: 'SALE',
      amount: input.grossAmount,
      balanceState: state,
      availableAt,
      eventId: input.eventId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      description: `${LEDGER_ENTRY_LABELS.SALE} · ${input.orderReference}`,
    });

    if (input.platformFeeAmount > 0) {
      await this.write(tx, {
        organizationId: input.organizationId,
        type: 'PLATFORM_FEE',
        amount: -input.platformFeeAmount,
        balanceState: state,
        availableAt,
        eventId: input.eventId,
        orderId: input.orderId,
        description: `${LEDGER_ENTRY_LABELS.PLATFORM_FEE} · ${input.orderReference}`,
      });
    }

    if (input.providerFeeAmount > 0) {
      await this.write(tx, {
        organizationId: input.organizationId,
        type: 'PROVIDER_FEE',
        amount: -input.providerFeeAmount,
        balanceState: state,
        availableAt,
        eventId: input.eventId,
        orderId: input.orderId,
        description: `${LEDGER_ENTRY_LABELS.PROVIDER_FEE} · ${input.orderReference}`,
      });
    }

    // Palier 2 : une part est disponible tout de suite, le reste attend. Le
    // déplacement est explicite, pour que le relevé le montre.
    if (plan.immediateAmount > 0 && plan.heldAmount > 0) {
      await this.write(tx, {
        organizationId: input.organizationId,
        type: 'HOLD',
        amount: -plan.heldAmount,
        eventId: input.eventId,
        orderId: input.orderId,
        description: `Part bloquée jusqu’à 48 h après l’événement · ${input.orderReference}`,
      });

      await this.write(tx, {
        organizationId: input.organizationId,
        type: 'RELEASE',
        amount: plan.heldAmount,
        balanceState: 'PENDING',
        availableAt: plan.availableAt,
        eventId: input.eventId,
        orderId: input.orderId,
        description: `Déblocage prévu · ${input.orderReference}`,
      });
    }
  }

  /**
   * Replanifie les recettes bloquées au palier 0, une fois l'organisation vérifiée.
   *
   * ── Le trou que ceci bouche ─────────────────────────────────────────────────
   * Le palier est fixé à la VENTE. Une organisation qui vend avant d'être
   * vérifiée voit ses recettes naître en `PENDING` sans date : la contrainte en
   * base le dit elle-même, « c'est la vérification d'identité qui débloque ».
   * Sauf que rien ne le faisait. L'argent restait « en attente » pour toujours,
   * vérification ou pas, et l'organisateur lisait à l'écran une promesse — « fais
   * vérifier ton identité pour débloquer les retraits » — que la vérification ne
   * tenait pas.
   *
   * ── Pourquoi des écritures, et non une mise à jour ──────────────────────────
   * Le grand livre est immuable ; la base le garantit par déclencheur. On ne
   * touche donc pas à la date des écritures d'origine : on neutralise leur net
   * dans la poche « sans date » par une mise en attente inverse, et on réinscrit
   * le même net avec la date de déblocage du palier désormais applicable. Le
   * total de l'organisation ne bouge pas d'un franc ; seule une date apparaît.
   *
   * Par événement, parce que la date dépend de sa fin. Idempotent : une fois
   * neutralisé, le net « sans date » d'un événement vaut zéro et n'est plus
   * replanifié.
   */
  async releaseUnverifiedHolds(
    tx: Prisma.TransactionClient,
    input: { organizationId: string; completedEventsCount: number },
  ): Promise<{ events: number; amount: number }> {
    const groups = await tx.ledgerEntry.groupBy({
      by: ['eventId'],
      where: {
        organizationId: input.organizationId,
        balanceState: 'PENDING',
        availableAt: null,
        eventId: { not: null },
      },
      _sum: { amount: true },
    });

    const tier = resolveHoldTier({
      isVerified: true,
      completedEventsCount: input.completedEventsCount,
    });

    let events = 0;
    let amount = 0;

    for (const group of groups) {
      const net = group._sum.amount ?? 0;
      if (!group.eventId || net <= 0) continue;

      const event = await tx.event.findUnique({
        where: { id: group.eventId },
        select: { title: true, endsAt: true },
      });
      if (!event) continue;

      const plan = planRelease({ netAmount: net, tier, eventEndsAt: event.endsAt });

      await this.write(tx, {
        organizationId: input.organizationId,
        type: 'HOLD',
        amount: -net,
        balanceState: 'PENDING',
        availableAt: null,
        eventId: group.eventId,
        description: `Palier levé par la vérification · ${event.title}`,
      });

      if (plan.immediateAmount > 0) {
        await this.write(tx, {
          organizationId: input.organizationId,
          type: 'RELEASE',
          amount: plan.immediateAmount,
          eventId: group.eventId,
          description: `Déblocage immédiat · ${event.title}`,
        });
      }

      if (plan.heldAmount > 0) {
        await this.write(tx, {
          organizationId: input.organizationId,
          type: 'RELEASE',
          amount: plan.heldAmount,
          balanceState: 'PENDING',
          availableAt: plan.availableAt,
          eventId: group.eventId,
          description: `Déblocage prévu ${tier.holdHoursAfterEvent} h après l’événement · ${event.title}`,
        });
      }

      events += 1;
      amount += net;
    }

    if (events > 0) {
      this.logger.log(
        `Vérification de ${input.organizationId} : ${amount} FCFA replanifiés sur ${events} événement(s)`,
      );
    }

    return { events, amount };
  }

  /**
   * Solde d'une organisation.
   *
   * ── Le déblocage se calcule, il ne se met pas à jour ────────────────────────
   * Une écriture `PENDING` dont la date est passée compte comme disponible.
   * Aucun job ne « débloque » quoi que ce soit : le temps suffit, et
   * l'immuabilité est préservée.
   */
  async balance(organizationId: string, now = new Date()): Promise<Balance> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { organizationId },
      select: { type: true, amount: true, balanceState: true, availableAt: true },
    });

    let available = 0;
    let pending = 0;
    let grossSales = 0;
    let platformFees = 0;
    let providerFees = 0;
    let refunds = 0;
    let paidOut = 0;
    let nextRelease: Date | null = null;

    for (const entry of entries) {
      const unlocked =
        entry.balanceState === 'AVAILABLE' ||
        (entry.availableAt !== null && entry.availableAt.getTime() <= now.getTime());

      if (unlocked) {
        available += entry.amount;
      } else {
        pending += entry.amount;

        if (
          entry.availableAt !== null &&
          (nextRelease === null || entry.availableAt < nextRelease)
        ) {
          nextRelease = entry.availableAt;
        }
      }

      if (entry.type === 'SALE') grossSales += entry.amount;
      if (entry.type === 'PLATFORM_FEE') platformFees -= entry.amount;
      if (entry.type === 'PROVIDER_FEE') providerFees -= entry.amount;
      if (entry.type === 'REFUND') refunds -= entry.amount;
      if (entry.type === 'PAYOUT') paidOut -= entry.amount;
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        verificationStatus: true,
        completedEventsCount: true,
        payoutFrozen: true,
        payoutFrozenReason: true,
      },
    });

    const blocked = this.payoutBlockedReason({
      available,
      isVerified: organization.verificationStatus === 'VERIFIED',
      frozen: organization.payoutFrozen,
      frozenReason: organization.payoutFrozenReason,
    });

    return {
      availableAmount: available,
      pendingAmount: pending,
      totalAmount: available + pending,
      currency: 'XOF',
      grossSales,
      platformFees,
      providerFees,
      refunds,
      paidOut,
      nextReleaseAt: nextRelease === null ? null : (nextRelease as Date).toISOString(),
      minPayoutAmount: DEFAULT_COMMISSION_POLICY.minPayoutAmount,
      canRequestPayout: blocked === null,
      payoutBlockedReason: blocked,
    };
  }

  /**
   * Pourquoi le retrait est-il impossible ?
   *
   * Répond dans l'ordre où l'organisateur peut agir : d'abord ce qu'il contrôle
   * (vérifier son identité), ensuite ce qui dépend du temps (attendre le
   * déblocage), enfin ce qui dépend de nous (un gel administratif).
   */
  private payoutBlockedReason(input: {
    available: number;
    isVerified: boolean;
    frozen: boolean;
    frozenReason: string | null;
  }): string | null {
    if (!input.isVerified) {
      return 'Fais vérifier ton identité pour débloquer les retraits. Cela prend moins de 24 h.';
    }

    if (input.frozen) {
      return (
        input.frozenReason ??
        'Les retraits sont suspendus sur ce compte. Contacte le support pour en connaître la raison.'
      );
    }

    if (input.available < DEFAULT_COMMISSION_POLICY.minPayoutAmount) {
      return `Le montant minimum d’un retrait est de ${DEFAULT_COMMISSION_POLICY.minPayoutAmount} FCFA.`;
    }

    return null;
  }

  /** Relevé détaillé, du plus récent au plus ancien. */
  async statement(organizationId: string, limit = 100): Promise<LedgerEntry[]> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        event: { select: { title: true } },
        order: { select: { reference: true } },
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      currency: entry.currency,
      balanceState: entry.balanceState,
      availableAt: entry.availableAt?.toISOString() ?? null,
      eventId: entry.eventId,
      eventTitle: entry.event?.title ?? null,
      orderId: entry.orderId,
      orderReference: entry.order?.reference ?? null,
      payoutId: entry.payoutId,
      description: entry.description,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  /**
   * Solde total (disponible + bloqué) de plusieurs organisations à la fois.
   *
   * ── Pourquoi ce n'est pas `balance()` appelé en boucle ──────────────────
   * `balance()` décompose disponible/bloqué/frais et lit l'organisation pour
   * en déduire le motif de blocage — nécessaire pour UN compte, coûteux pour
   * une liste qui en affiche jusqu'à deux cents. Une seule requête groupée
   * suffit quand seul le total compte, pour trier ou afficher une liste.
   *
   * Trois copies quasi identiques de cette agrégation existaient déjà
   * (`ModerationService`, `VerificationsService`) : elle vit maintenant ici,
   * à côté du reste de la logique du grand livre.
   */
  async balancesFor(organizationIds: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(organizationIds)];
    if (unique.length === 0) return new Map();

    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: unique } },
      _sum: { amount: true },
    });

    return new Map(rows.map((row) => [row.organizationId, row._sum.amount ?? 0]));
  }
}
