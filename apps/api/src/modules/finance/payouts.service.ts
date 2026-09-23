import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  canTransitionPayout,
  computePayoutFee,
  getPaymentMethodDefinition,
  validatePayoutRequest,
  type AdminPayoutSummary,
  type Payout,
  type PaymentMethodCode,
  type PaymentProviderCode,
  type PayoutStatus,
  type RecordPayoutInput,
  type RequestPayoutInput,
} from '@nexakabi/contracts';
import { maskPhone, resolveCurrency } from '@nexakabi/utils';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { PaymentRoutingService, type ResolvedRoute } from '../payments/payment-routing.service';
import { PaymentProviderRegistry } from '../payments/provider.registry';
import type { NormalizedPayoutWebhook } from '../payments/providers/payment-provider';
import { CommissionService } from './commission.service';
import { LedgerService } from './ledger.service';

/**
 * Retraits.
 *
 * ── Le moment le plus sensible de la relation ───────────────────────────────
 * Un organisateur qui n'arrive pas à récupérer son argent ne revient pas, et le
 * dit autour de lui. Trois règles en découlent, toutes visibles dans ce
 * fichier :
 *
 *  1. **Le net est affiché AVANT validation.** Découvrir les frais après coup
 *     est la première cause de défiance.
 *  2. **Le débit est immédiat**, dès la demande : sans cela, deux demandes
 *     concurrentes retireraient deux fois le même argent.
 *  3. **Un échec rend l'argent**, par une écriture inverse, avec la cause.
 *     Jamais un solde qui disparaît sans explication.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly registry: PaymentProviderRegistry,
    private readonly routing: PaymentRoutingService,
    private readonly commission: CommissionService,
  ) {}

  /**
   * Simule un retrait sans l'exécuter.
   *
   * Alimente l'écran de demande : l'organisateur voit le net exact avant de
   * valider quoi que ce soit.
   */
  async quote(
    organizationId: string,
    amount: number,
  ): Promise<{ grossAmount: number; feeAmount: number; netAmount: number; error: string | null }> {
    const [balance, policy] = await Promise.all([
      this.ledger.balance(organizationId),
      this.commission.resolveForOrganization(organizationId),
    ]);
    const feeAmount = computePayoutFee(amount, policy);

    return {
      grossAmount: amount,
      feeAmount,
      netAmount: amount - feeAmount,
      error:
        balance.payoutBlockedReason ??
        validatePayoutRequest(
          amount,
          balance.availableAmount,
          policy,
          resolveCurrency(balance.currency).symbol,
        ),
    };
  }

  /**
   * Enregistre une demande de retrait.
   *
   * Le solde est débité DANS la même transaction. Attendre l'exécution laisserait
   * une fenêtre pendant laquelle une seconde demande verrait un solde déjà
   * engagé — et deux retraits partiraient pour le même argent.
   */
  async request(
    organizationId: string,
    userId: string,
    input: RequestPayoutInput,
  ): Promise<Payout> {
    const account = await this.prisma.payoutAccount.findFirst({
      where: { id: input.payoutAccountId, organizationId, deletedAt: null },
    });

    if (!account) {
      throw new NotFoundException("Ce compte de retrait n'existe pas.");
    }

    const [balance, policy] = await Promise.all([
      this.ledger.balance(organizationId),
      this.commission.resolveForOrganization(organizationId),
    ]);

    if (balance.payoutBlockedReason) {
      throw new BadRequestException(balance.payoutBlockedReason);
    }

    // Un compte enregistré sous un moyen depuis fermé en versement ne doit
    // pas produire un retrait sans issue.
    if (!(await this.routing.isPayoutMethodOpen(account.countryCode, account.methodCode))) {
      throw new BadRequestException(
        `Le moyen de réception de ce compte n'est plus disponible pour ${account.countryCode}. Enregistre un autre compte.`,
      );
    }

    if (account.currency !== balance.currency) {
      throw new BadRequestException(
        `Ce compte reçoit en ${account.currency} alors que ton solde est en ${balance.currency}.`,
      );
    }

    const refusal = validatePayoutRequest(
      input.amount,
      balance.availableAmount,
      policy,
      resolveCurrency(balance.currency).symbol,
    );

    if (refusal) {
      throw new BadRequestException(refusal);
    }

    const feeAmount = computePayoutFee(input.amount, policy);
    const netAmount = input.amount - feeAmount;

    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: {
          reference: `NKP-${randomBytes(3).toString('hex').toUpperCase()}`,
          organizationId,
          payoutAccountId: account.id,
          requestedByUserId: userId,
          grossAmount: input.amount,
          feeAmount,
          netAmount,
          currency: balance.currency,
          status: 'PENDING',
        },
      });

      // Le débit est immédiat : l'argent est engagé dès la demande.
      await this.ledger.write(tx, {
        organizationId,
        type: 'PAYOUT',
        amount: -netAmount,
        payoutId: created.id,
        description: `Retrait ${created.reference}`,
      });

      if (feeAmount > 0) {
        await this.ledger.write(tx, {
          organizationId,
          type: 'PAYOUT_FEE',
          amount: -feeAmount,
          payoutId: created.id,
          description: `Frais de retrait ${created.reference}`,
        });
      }

      return created;
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.payoutRequested,
      entityType: 'payout',
      entityId: payout.id,
      actorUserId: userId,
      organizationId,
      changes: { grossAmount: input.amount, feeAmount, netAmount },
    });

    return this.toPayout(payout.id);
  }

  /**
   * Fait avancer une demande.
   *
   * Un échec déclenche l'écriture inverse qui rend l'argent au solde. Elle est
   * écrite ICI, dans la même transaction que le changement d'état — pas dans un
   * job différé. Le prototype annonce « sous 24 h » ; rien n'oblige à attendre,
   * et un solde qui reste faux une journée est une journée de trop.
   */
  /**
   * Exécute un versement chez l'opérateur.
   *
   * ── L'ordre des opérations, et pourquoi il n'est pas négociable ─────────
   * L'appel à l'opérateur précède le changement d'état, comme pour les
   * remboursements. Si l'argent ne part pas, rien n'est écrit — l'inverse
   * laisserait un retrait marqué « en cours » que l'organisateur attendrait
   * indéfiniment.
   *
   * ── Pourquoi le résultat n'est jamais `PAID` immédiatement ─────────────
   * Un versement Mobile Money est asynchrone : l'opérateur accuse réception et
   * transfère ensuite. Le passage à `PAID` vient du webhook ou de
   * l'interrogation. Marquer « payé » sur un simple accusé de réception
   * afficherait à l'organisateur un argent qui n'est pas encore chez lui.
   */
  async execute(payoutId: string, userId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        payoutAccount: true,
        organization: { select: { owner: { select: { email: true } } } },
      },
    });

    if (!payout) {
      throw new NotFoundException("Cette demande de retrait n'existe pas.");
    }

    if (payout.status !== 'PENDING') {
      throw new ConflictException(`Un retrait ${payout.status} ne peut plus être exécuté.`);
    }

    /**
     * Le gel est revérifié ICI, pas seulement à la demande.
     *
     * ── Pourquoi la vérification à la demande ne suffit pas ────────────────
     * `request()` contrôle bien le gel, mais un retrait reste `PENDING` le
     * temps qu'un administrateur l'exécute — et c'est précisément dans cet
     * intervalle qu'un signalement arrive et qu'on gèle les fonds. Geler après
     * la demande n'empêchait donc pas le versement : le gel arrivait trop tard
     * pour le seul cas où il sert.
     */
    /**
     * Seuls le gel et la vérification comptent ici — pas le minimum de retrait.
     * Le montant a déjà été débité à la demande : le solde disponible est
     * souvent SOUS le minimum au moment d'exécuter, et ce n'est pas une raison
     * de refuser le versement d'un retrait déjà accordé. Une première version
     * relisait `payoutBlockedReason` en entier, et refusait précisément le cas
     * le plus courant : l'organisateur qui retire tout son solde.
     */
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: payout.organizationId },
      select: { payoutFrozen: true, payoutFrozenReason: true, verificationStatus: true },
    });

    if (organization.payoutFrozen) {
      throw new ConflictException(
        `Versement refusé : ${organization.payoutFrozenReason ?? 'les retraits de cette organisation sont gelés.'} ` +
          'Lève le gel avant de verser, ou annule ce retrait.',
      );
    }

    if (organization.verificationStatus !== 'VERIFIED') {
      throw new ConflictException(
        "Versement refusé : l'organisation n'est plus vérifiée. Annule ce retrait ou rétablis la vérification.",
      );
    }

    // Le prestataire est celui que le PAYS et le MOYEN du compte de réception
    // désignent — jamais celui par lequel les participants ont payé. Un
    // organisateur reçoit sur MTN ce que ses acheteurs ont réglé par carte.
    const route = await this.resolveRoute(payout.payoutAccount);

    if (!route?.provider.payout) {
      throw new ConflictException(
        'Aucun prestataire configuré ne sait verser sur ce moyen dans ce pays. ' +
          'Le virement doit être fait à la main, puis enregistré ici.',
      );
    }

    const result = await route.provider.payout({
      reference: payout.reference,
      amount: payout.netAmount,
      currency: payout.currency,
      countryCode: route.countryCode,
      method: route.method,
      accountNumber: payout.payoutAccount.accountNumber,
      accountHolderName: payout.payoutAccount.accountHolderName,
      email: payout.organization.owner.email ?? undefined,
    });

    /**
     * Toujours par « en cours », même quand l'opérateur conclut sur-le-champ.
     *
     * La machine à états n'admet pas `PENDING → PAID` : le passage par
     * `PROCESSING` pose la référence de l'opérateur et l'instant d'envoi, que
     * l'historique doit montrer même quand la réponse a été immédiate. Un
     * refus immédiat suit le même chemin, puis restitue le montant.
     */
    const processing = await this.transition(payoutId, 'PROCESSING', {
      userId,
      providerCode: route.provider.code,
      providerReference: result.providerReference,
    });

    if (result.status === 'PROCESSING') return processing;

    return this.transition(payoutId, result.status, {
      userId,
      failureReason:
        result.status === 'FAILED'
          ? (result.failureReason ?? "L'opérateur a refusé le versement.")
          : undefined,
    });
  }

  /** Nombre de versements interrogés par passage. Borne la charge sur l'opérateur. */
  static readonly RECONCILE_BATCH_SIZE = 50;

  /**
   * Interroge l'opérateur sur les versements restés « en cours ».
   *
   * ── Le trou que ceci bouche ──────────────────────────────────────────────
   * `execute()` obtenait un accusé de réception et passait le retrait en
   * `PROCESSING` — puis plus rien, jamais : aucun webhook, aucune
   * interrogation. Le commentaire promettait que « le passage à PAID vient du
   * webhook ou de l'interrogation », et ni l'un ni l'autre n'existait. Un
   * retrait restait « en cours » pour toujours, avec l'argent parti pour de
   * vrai chez l'organisateur et un écran qui disait le contraire.
   *
   * Appelée chaque minute par le planificateur, sous verrou : deux instances
   * ne doivent pas conclure deux fois le même versement.
   */
  async reconcileProcessing(): Promise<{ inspected: number; paid: number; failed: number }> {
    const payouts = await this.prisma.payout.findMany({
      where: { status: 'PROCESSING', providerReference: { not: null } },
      orderBy: { processedAt: 'asc' },
      take: PayoutsService.RECONCILE_BATCH_SIZE,
      select: {
        id: true,
        reference: true,
        providerCode: true,
        providerReference: true,
        processedByUserId: true,
      },
    });

    let paid = 0;
    let failed = 0;

    for (const payout of payouts) {
      // Le prestataire qui a VERSÉ est celui qu'on interroge — enregistré sur
      // le retrait à l'exécution, indépendant de la configuration d'aujourd'hui.
      const code = payout.providerCode as PaymentProviderCode | null;
      if (!code || !this.registry.has(code)) continue;

      const provider = this.registry.get(code);
      if (!provider.getPayoutStatus || !payout.providerReference) continue;

      try {
        const status = await provider.getPayoutStatus(payout.providerReference);
        if (status.status === 'PROCESSING') continue;

        await this.transition(payout.id, status.status, {
          // L'issue reste rattachée à l'administrateur qui a lancé le versement,
          // et marquée « système » : c'est l'interrogation qui a conclu, pas lui.
          userId: payout.processedByUserId ?? undefined,
          system: true,
          failureReason: status.failureReason ?? "L'opérateur a refusé le versement.",
        });

        if (status.status === 'PAID') paid += 1;
        else failed += 1;
      } catch (error) {
        // Un opérateur injoignable ne doit pas faire échouer le passage : le
        // versement sera réinterrogé à la minute suivante.
        this.logger.warn(
          `Réconciliation du retrait ${payout.reference} impossible : ${
            error instanceof Error ? error.message : 'erreur inconnue'
          }`,
        );
      }
    }

    if (paid + failed > 0) {
      this.logger.log(
        `Réconciliation des retraits : ${paid} effectué(s), ${failed} échoué(s) sur ${payouts.length} en cours`,
      );
    }

    return { inspected: payouts.length, paid, failed };
  }

  /**
   * Enregistre un versement fait hors plateforme.
   *
   * ── Deux cas, un seul geste ──────────────────────────────────────────────
   * Un virement bancaire ne passe par aucun agrégateur : l'administrateur le
   * fait depuis la banque, puis le consigne ici avec sa référence. Et quand un
   * opérateur n'a pas su verser automatiquement, c'est le même geste qui
   * conclut — le message d'échec de `execute()` le promettait sans que rien
   * ne le permette.
   *
   * Depuis `PENDING`, le retrait passe par `PROCESSING` : la machine à états
   * n'admet pas de raccourci, et l'historique doit montrer les deux instants.
   */
  async recordManual(payoutId: string, input: RecordPayoutInput, userId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: { status: true },
    });

    if (!payout) {
      throw new NotFoundException("Cette demande de retrait n'existe pas.");
    }

    if (payout.status !== 'PENDING' && payout.status !== 'PROCESSING') {
      throw new ConflictException(`Un retrait ${payout.status} ne peut plus être enregistré.`);
    }

    if (payout.status === 'PENDING') {
      await this.transition(payoutId, 'PROCESSING', {
        userId,
        providerReference: input.reference,
      });
    }

    return this.transition(payoutId, input.outcome, {
      userId,
      providerReference: input.reference,
      failureReason: input.failureReason,
    });
  }

  /**
   * Notification de versement reçue d'un prestataire.
   *
   * Même idempotence que les encaissements : l'événement est consigné dans
   * `webhook_event`, un rejeu est reconnu. Un retrait déjà conclu n'est jamais
   * rouvert — la machine à états le refuse, et on se contente de le noter.
   */
  async handleProviderEvent(
    providerCode: PaymentProviderCode,
    event: NormalizedPayoutWebhook,
  ): Promise<{ duplicate: boolean; applied: boolean }> {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { providerCode_externalId: { providerCode, externalId: event.externalId } },
    });

    if (existing && existing.status !== 'RECEIVED' && existing.status !== 'FAILED') {
      return { duplicate: true, applied: false };
    }

    let record = existing;

    if (!record) {
      try {
        record = await this.prisma.webhookEvent.create({
          data: { providerCode, externalId: event.externalId, rawBody: JSON.stringify(event) },
        });
      } catch (error) {
        // Même événement livré deux fois et traité en parallèle : l'index unique
        // a tranché, l'autre traitement s'en occupe.
        if (!isUniqueViolation(error)) throw error;
        return { duplicate: true, applied: false };
      }
    }

    const payout = await this.prisma.payout.findFirst({
      where: { providerCode, providerReference: event.providerReference },
      select: { id: true, status: true, processedByUserId: true, reference: true },
    });

    if (!payout) {
      // `FAILED` et non `RECEIVED` : la reprise des notifications orphelines ne
      // cherche que des PAIEMENTS, et y aurait classé celle-ci « illisible ».
      // Rien n'est perdu — l'interrogation minute par minute des retraits en
      // cours conclura, et un rejeu du prestataire est encore repris.
      await this.prisma.webhookEvent.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          error: `Aucun retrait pour la référence ${event.providerReference} — l'interrogation des retraits en cours conclura.`,
        },
      });
      this.logger.warn(
        `Notification de versement ${providerCode}/${event.externalId} sans retrait`,
      );
      return { duplicate: Boolean(existing), applied: false };
    }

    let applied = false;

    if (event.status !== 'PROCESSING' && canTransitionPayout(payout.status, event.status)) {
      await this.transition(payout.id, event.status, {
        userId: payout.processedByUserId ?? undefined,
        system: true,
        failureReason: event.failureReason ?? "L'opérateur a refusé le versement.",
      });
      applied = true;
    }

    await this.prisma.webhookEvent.update({
      where: { id: record.id },
      data: { status: applied ? 'PROCESSED' : 'IGNORED', processedAt: new Date(), error: null },
    });

    return { duplicate: Boolean(existing), applied };
  }

  /**
   * Le prestataire qui verse sur un compte de réception, ou `null` si le
   * virement se fait à la main.
   */
  private resolveRoute(account: {
    countryCode: string;
    methodCode: string;
  }): Promise<ResolvedRoute | null> {
    return this.routing.resolvePayout(account.countryCode, account.methodCode as PaymentMethodCode);
  }

  async transition(
    payoutId: string,
    to: PayoutStatus,
    context: {
      /** Absent quand c'est la réconciliation qui conclut, sans personne derrière. */
      userId?: string;
      failureReason?: string;
      providerCode?: string;
      providerReference?: string;
      /** Conclu par la réconciliation, pas par une personne. */
      system?: boolean;
    },
  ): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });

    if (!payout) {
      throw new NotFoundException("Cette demande de retrait n'existe pas.");
    }

    if (!canTransitionPayout(payout.status, to)) {
      throw new ConflictException(`Un retrait ${payout.status} ne peut pas passer à ${to}.`);
    }

    if (to === 'FAILED' && !context.failureReason) {
      // Sans cause, l'organisateur ne peut pas corriger son compte, et le
      // support n'a rien à lui dire.
      throw new BadRequestException('Un échec de retrait exige une cause.');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: to,
          providerCode: context.providerCode ?? payout.providerCode,
          providerReference: context.providerReference ?? payout.providerReference,
          failureReason: to === 'FAILED' ? context.failureReason : payout.failureReason,
          processedAt: to === 'PROCESSING' ? now : payout.processedAt,
          completedAt: to === 'PAID' || to === 'FAILED' ? now : payout.completedAt,
          processedByUserId: context.userId ?? payout.processedByUserId,
        },
      });

      if (to === 'FAILED' || to === 'CANCELLED') {
        await this.ledger.write(tx, {
          organizationId: payout.organizationId,
          type: 'PAYOUT_REVERSAL',
          amount: payout.grossAmount,
          payoutId: payout.id,
          description:
            to === 'FAILED'
              ? `Retrait ${payout.reference} échoué · montant restitué`
              : `Retrait ${payout.reference} annulé · montant restitué`,
        });
      }

      if (to === 'FAILED' && context.failureReason) {
        // Le compte est probablement en cause : le marquer évite que
        // l'organisateur réessaie dix fois avec le même numéro.
        await tx.payoutAccount.update({
          where: { id: payout.payoutAccountId },
          data: { lastFailureReason: context.failureReason },
        });
      }
    });

    await this.audit.record({
      action: to === 'FAILED' ? AUDIT_ACTIONS.payoutFailed : AUDIT_ACTIONS.payoutProcessed,
      entityType: 'payout',
      entityId: payoutId,
      actorUserId: context.userId,
      actorType: context.system ? 'SYSTEM' : undefined,
      organizationId: payout.organizationId,
      changes: { from: payout.status, to, reason: context.failureReason },
    });

    return this.toPayout(payoutId);
  }

  /**
   * Retraits, tous organisations confondues — vue plateforme.
   *
   * ── Le manque que ça comble ──────────────────────────────────────────────
   * `POST /admin/payouts/:id/execute` existait déjà, mais rien ne permettait
   * à un administrateur d'en trouver l'identifiant : `list()` exige une
   * organisation, et la seule agrégation disponible côté tableau de bord est
   * un total (`payoutSum`), jamais les lignes qui le composent.
   */
  async listAll(filter: { status?: PayoutStatus } = {}): Promise<AdminPayoutSummary[]> {
    const payouts = await this.prisma.payout.findMany({
      where: filter.status ? { status: filter.status } : {},
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: { payoutAccount: true, organization: { select: { id: true, name: true } } },
    });

    const views: AdminPayoutSummary[] = [];

    for (const payout of payouts) {
      views.push({
        ...toPayoutView(payout, await this.isAutomatic(payout.payoutAccount)),
        organizationId: payout.organization.id,
        organizationName: payout.organization.name,
      });
    }

    return views;
  }

  async list(organizationId: string, limit = 50): Promise<Payout[]> {
    const payouts = await this.prisma.payout.findMany({
      where: { organizationId },
      orderBy: { requestedAt: 'desc' },
      take: limit,
      include: { payoutAccount: true },
    });

    const views: Payout[] = [];

    for (const payout of payouts) {
      views.push(toPayoutView(payout, await this.isAutomatic(payout.payoutAccount)));
    }

    return views;
  }

  async findOne(organizationId: string, payoutId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, organizationId },
      include: { payoutAccount: true },
    });

    if (!payout) {
      throw new NotFoundException("Cette demande de retrait n'existe pas.");
    }

    return toPayoutView(payout, await this.isAutomatic(payout.payoutAccount));
  }

  private async toPayout(payoutId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      include: { payoutAccount: true },
    });

    return toPayoutView(payout, await this.isAutomatic(payout.payoutAccount));
  }

  /** Vrai si un prestataire branché sait exécuter le versement vers ce compte. */
  private async isAutomatic(account: {
    countryCode: string;
    methodCode: string;
  }): Promise<boolean> {
    const route = await this.resolveRoute(account);
    return Boolean(route?.provider.payout);
  }
}

/**
 * Ligne de retrait, avec son compte.
 *
 * Le type est décrit structurellement plutôt qu'inféré de Prisma : il dit
 * exactement ce dont la présentation a besoin, et ne casse pas à chaque champ
 * ajouté au modèle.
 */
interface PayoutRow {
  id: string;
  reference: string;
  status: PayoutStatus;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  currency: string;
  failureReason: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  providerCode: string | null;
  payoutAccount: {
    type: string;
    methodCode: string;
    countryCode: string;
    bankName: string | null;
    accountNumber: string;
  };
}

function toPayoutView(payout: PayoutRow, automatic = false): Payout {
  return {
    id: payout.id,
    reference: payout.reference,
    status: payout.status,
    grossAmount: payout.grossAmount,
    feeAmount: payout.feeAmount,
    netAmount: payout.netAmount,
    currency: payout.currency,
    accountType: payout.payoutAccount.type === 'BANK' ? 'BANK' : 'MOBILE_MONEY',
    accountLabel: accountLabel(payout.payoutAccount),
    // Jamais le numéro complet : cet écran se consulte parfois à plusieurs.
    accountMaskedNumber: maskAccount(payout.payoutAccount.accountNumber),
    methodCode: payout.payoutAccount.methodCode,
    countryCode: payout.payoutAccount.countryCode,
    automatic,
    failureReason: payout.failureReason,
    requestedAt: payout.requestedAt.toISOString(),
    processedAt: payout.processedAt?.toISOString() ?? null,
    completedAt: payout.completedAt?.toISOString() ?? null,
  };
}

/**
 * Libellé du compte, tel que l'organisateur le reconnaît.
 *
 * Il en a souvent plusieurs : « MTN MoMo » et « Bank of Africa » se
 * distinguent d'un coup d'œil, « Compte 1 » et « Compte 2 » non.
 */
function accountLabel(account: PayoutRow['payoutAccount']): string {
  if (account.type === 'BANK' && account.bankName) return account.bankName;
  const definition = getPaymentMethodDefinition(account.methodCode);
  if (definition) return definition.label;
  return account.type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Compte bancaire';
}

/**
 * Masque un numéro de compte.
 *
 * Un compte Mobile Money est un numéro de téléphone : le masque de téléphone
 * s'applique. Un IBAN ou un numéro bancaire ne l'est pas, et se réduit à ses
 * quatre derniers caractères.
 */
function maskAccount(accountNumber: string): string {
  if (accountNumber.startsWith('+')) {
    try {
      return maskPhone(accountNumber);
    } catch {
      // Numéro hors plan béninois : on retombe sur le masque générique.
    }
  }

  return `•••• ${accountNumber.slice(-4)}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
