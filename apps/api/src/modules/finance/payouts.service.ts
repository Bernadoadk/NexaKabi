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
  validatePayoutRequest,
  type AdminPayoutSummary,
  type Payout,
  type PayoutAccountType,
  type PayoutStatus,
  type RecordPayoutInput,
  type RequestPayoutInput,
} from '@nexakabi/contracts';
import { maskPhone } from '@nexakabi/utils';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { PaymentProviderRegistry } from '../payments/provider.registry';
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
    const balance = await this.ledger.balance(organizationId);
    const feeAmount = computePayoutFee(amount);

    return {
      grossAmount: amount,
      feeAmount,
      netAmount: amount - feeAmount,
      error: balance.payoutBlockedReason ?? validatePayoutRequest(amount, balance.availableAmount),
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

    const balance = await this.ledger.balance(organizationId);

    if (balance.payoutBlockedReason) {
      throw new BadRequestException(balance.payoutBlockedReason);
    }

    const refusal = validatePayoutRequest(input.amount, balance.availableAmount);

    if (refusal) {
      throw new BadRequestException(refusal);
    }

    const feeAmount = computePayoutFee(input.amount);
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
    const balance = await this.ledger.balance(payout.organizationId);

    if (balance.payoutBlockedReason) {
      throw new ConflictException(
        `Versement refusé : ${balance.payoutBlockedReason} ` +
          'Lève le gel avant de verser, ou annule ce retrait.',
      );
    }

    const provider = this.resolveProvider(payout.payoutAccount.type);

    if (!provider?.payout) {
      throw new ConflictException(
        'Aucun opérateur configuré ne sait verser automatiquement. ' +
          'Le virement doit être fait à la main, puis enregistré ici.',
      );
    }

    const result = await provider.payout({
      reference: payout.reference,
      amount: payout.netAmount,
      currency: payout.currency,
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
        providerReference: true,
        processedByUserId: true,
        payoutAccount: { select: { type: true } },
      },
    });

    let paid = 0;
    let failed = 0;

    for (const payout of payouts) {
      const provider = this.resolveProvider(payout.payoutAccount.type);
      if (!provider?.getPayoutStatus || !payout.providerReference) continue;

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
   * Choisit l'opérateur qui versera.
   *
   * ── Ce que ce choix a de simple, et pourquoi ────────────────────────────
   * Un seul agrégateur — FedaPay — couvre les trois opérateurs béninois. Le
   * premier fournisseur capable de verser fait l'affaire : ils partagent le même
   * compte marchand et la même API.
   *
   * Le jour où plusieurs agrégateurs coexisteront, ce point sera le seul à
   * changer — et il faudra alors router selon l'opérateur du compte, pas selon
   * l'ordre d'enregistrement.
   */
  private resolveProvider(accountType: PayoutAccountType | string) {
    if (accountType !== 'MOBILE_MONEY') {
      // Un virement bancaire ne passe pas par un agrégateur Mobile Money : il
      // se fait à la main, et `transition` l'enregistre.
      return null;
    }

    for (const code of this.registry.availableCodes) {
      const provider = this.registry.get(code);
      if (provider.capabilities.payout && provider.payout) return provider;
    }

    return null;
  }

  async transition(
    payoutId: string,
    to: PayoutStatus,
    context: {
      /** Absent quand c'est la réconciliation qui conclut, sans personne derrière. */
      userId?: string;
      failureReason?: string;
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

    return payouts.map((payout) => ({
      ...toPayoutView(payout),
      organizationId: payout.organization.id,
      organizationName: payout.organization.name,
    }));
  }

  async list(organizationId: string, limit = 50): Promise<Payout[]> {
    const payouts = await this.prisma.payout.findMany({
      where: { organizationId },
      orderBy: { requestedAt: 'desc' },
      take: limit,
      include: { payoutAccount: true },
    });

    return payouts.map(toPayoutView);
  }

  async findOne(organizationId: string, payoutId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, organizationId },
      include: { payoutAccount: true },
    });

    if (!payout) {
      throw new NotFoundException("Cette demande de retrait n'existe pas.");
    }

    return toPayoutView(payout);
  }

  private async toPayout(payoutId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      include: { payoutAccount: true },
    });

    return toPayoutView(payout);
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
  payoutAccount: {
    type: string;
    provider: string | null;
    bankName: string | null;
    accountNumber: string;
  };
}

function toPayoutView(payout: PayoutRow): Payout {
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
  if (account.provider) return account.provider;
  if (account.bankName) return account.bankName;
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
