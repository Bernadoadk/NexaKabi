import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  reportPriority,
  type CreateReportInput,
  type FreezeFundsInput,
  type ReportSummary,
  type ResolveReportInput,
  type UnfreezeFundsInput,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../finance/ledger.service';

/**
 * Signalements et mesures conservatoires.
 *
 * ── La seule décision qui compte vraiment ─────────────────────────────────
 * Faut-il geler les fonds avant le prochain versement ? Un versement parti ne
 * revient pas : c'est la seule action de ce service qui soit irréversible dans
 * son absence, et c'est pourquoi tout le reste — tri, priorité, affichage du
 * solde dans la liste — est organisé autour d'elle.
 *
 * ── Le gel ne détruit rien ────────────────────────────────────────────────
 * Il écrit une paire d'écritures qui déplace de l'argent de la poche disponible
 * vers la poche bloquée. Le total de l'organisation est identique avant et
 * après. Un gel levé à tort se corrige par l'écriture inverse, et les deux
 * restent visibles dans le relevé — l'organisateur voit ce qui lui est arrivé
 * et quand.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Enregistre un signalement.
   *
   * ── Pourquoi l'organisation est résolue ici ─────────────────────────────
   * Un signalement vise souvent un événement, mais le risque financier porte
   * sur l'organisation qui détient les fonds. La résoudre au dépôt, plutôt qu'à
   * la lecture, permet de trier la file par montant en jeu sans jointure — et
   * garde la trace même si l'événement est supprimé ensuite.
   */
  async createReport(
    input: CreateReportInput,
    reporterUserId?: string,
  ): Promise<{ reference: string }> {
    if (!reporterUserId && !input.reporterPhone) {
      throw new BadRequestException(
        'Laisse un numéro pour qu’on puisse te recontacter, ou connecte-toi.',
      );
    }

    const organizationId = await this.resolveOrganization(input.targetType, input.targetId);

    if (organizationId === undefined) {
      throw new NotFoundException('L’élément signalé n’existe pas.');
    }

    const report = await this.prisma.report.create({
      data: {
        reference: generateReportReference(),
        targetType: input.targetType,
        targetId: input.targetId,
        organizationId,
        reason: input.reason,
        details: input.details,
        reporterUserId,
        reporterPhone: input.reporterPhone,
      },
      select: { id: true, reference: true },
    });

    this.logger.log(`Signalement ${report.reference} · ${input.reason}`);

    return { reference: report.reference };
  }

  /**
   * File des signalements, triée par risque.
   *
   * Le tri se fait en mémoire : la priorité combine le motif et le solde de
   * l'organisation, deux valeurs qui vivent dans des tables différentes. Au
   * volume attendu — quelques dizaines de dossiers ouverts — la lisibilité de
   * `reportPriority` vaut mieux qu'une expression SQL que personne ne relira.
   */
  async listReports(filter: { status?: string } = {}): Promise<ReportSummary[]> {
    const reports = await this.prisma.report.findMany({
      where: filter.status
        ? { status: filter.status as 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED' }
        : { status: { in: ['NEW', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        reference: true,
        targetType: true,
        targetId: true,
        organizationId: true,
        organization: { select: { name: true } },
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        reporter: { select: { fullName: true, phone: true } },
        reporterPhone: true,
      },
    });

    const balances = await this.ledger.balancesFor(
      reports.map((report) => report.organizationId).filter((id): id is string => id !== null),
    );

    const labels = await this.labelsFor(reports);

    const summaries: ReportSummary[] = reports.map((report) => ({
      id: report.id,
      reference: report.reference,
      targetType: report.targetType,
      targetId: report.targetId,
      targetLabel: labels.get(`${report.targetType}:${report.targetId}`) ?? 'Élément supprimé',
      organizationId: report.organizationId,
      organizationName: report.organization?.name ?? null,
      reason: report.reason,
      details: report.details,
      status: report.status,
      reporterLabel:
        report.reporter?.fullName || report.reporter?.phone || report.reporterPhone || 'Anonyme',
      createdAt: report.createdAt.toISOString(),
      organizationBalance: report.organizationId
        ? (balances.get(report.organizationId) ?? 0)
        : null,
    }));

    return summaries.sort((a, b) => {
      const difference = reportPriority(b) - reportPriority(a);
      // À priorité égale, le plus ancien d'abord : sans ce départage, un dossier
      // de faible priorité pourrait rester en bas de la file indéfiniment.
      return difference !== 0 ? difference : a.createdAt.localeCompare(b.createdAt);
    });
  }

  async getReport(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        organization: { select: { id: true, name: true, verificationStatus: true } },
        reporter: { select: { fullName: true, phone: true } },
        notes: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { fullName: true } } },
        },
      },
    });

    if (!report) throw new NotFoundException('Ce signalement n’existe pas.');

    const balance = report.organizationId ? await this.ledger.balance(report.organizationId) : null;

    return { ...report, balance };
  }

  /** Prend un dossier en charge. Évite que deux modérateurs travaillent dessus. */
  async assignReport(reportId: string, userId: string): Promise<void> {
    const report = await this.prisma.report.findUniqueOrThrow({
      where: { id: reportId },
      select: { status: true, assignedToUserId: true },
    });

    if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
      throw new ConflictException('Ce dossier est déjà clos.');
    }

    if (report.assignedToUserId && report.assignedToUserId !== userId) {
      throw new ConflictException('Ce dossier est déjà pris en charge par quelqu’un d’autre.');
    }

    await this.prisma.report.update({
      where: { id: reportId },
      data: { assignedToUserId: userId, status: 'IN_PROGRESS' },
    });
  }

  async addNote(reportId: string, userId: string, body: string): Promise<void> {
    await this.prisma.reportNote.create({
      data: { reportId, authorUserId: userId, body: body.trim() },
    });
  }

  /**
   * Clôt un dossier.
   *
   * Le motif est obligatoire — la contrainte `report_decision_is_motivated`
   * l'impose en base, avec un minimum de dix caractères. « OK » ne dit rien à
   * celui qui rouvrira le dossier dans six mois.
   */
  async resolveReport(reportId: string, input: ResolveReportInput, userId: string): Promise<void> {
    const report = await this.prisma.report.findUniqueOrThrow({
      where: { id: reportId },
      select: { status: true, reference: true },
    });

    if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
      throw new ConflictException('Ce dossier est déjà clos.');
    }

    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: input.decision,
        resolutionNote: input.note,
        resolvedAt: new Date(),
        resolvedByUserId: userId,
      },
    });

    await this.audit.record({
      action: 'admin.report.resolved',
      entityType: 'Report',
      entityId: reportId,
      actorUserId: userId,
      changes: { decision: input.decision, note: input.note },
    });

    this.logger.log(`Signalement ${report.reference} → ${input.decision}`);
  }

  // ── Gel des fonds ─────────────────────────────────────────────────────────

  /**
   * Gèle tout ou partie du solde disponible d'une organisation.
   *
   * ── Ce que « geler » veut dire exactement ───────────────────────────────
   * Une PAIRE d'écritures qui déplace sans rien détruire :
   *
   *   FREEZE     (−, AVAILABLE)          retire de la poche disponible
   *   ADJUSTMENT (+, PENDING, sans date) remet le même montant côté bloqué
   *
   * Le total de l'organisation est identique avant et après : seule la poche
   * change. Une écriture `FREEZE` isolée, elle, ferait disparaître de l'argent
   * du grand livre — et le premier rapprochement comptable ne saurait plus dire
   * où il est passé.
   *
   * ── Ce qui distingue un gel d'un blocage par palier ─────────────────────
   * L'absence de `availableAt`. Une recette bloquée par palier redevient
   * disponible d'elle-même quand sa date arrive ; des fonds gelés ne
   * redeviennent JAMAIS disponibles sans une décision explicite. C'est ce champ
   * nul, et rien d'autre, qui porte la différence.
   *
   * ── Ce qui est gelable : tout le compte, pas le seul disponible ─────────
   * Une première version plafonnait le gel au solde disponible. Un test l'a
   * mise en défaut : juste après un achat, au premier palier, TOUT est encore
   * bloqué — le disponible vaut zéro, et le gel était donc refusé sur le compte
   * qu'il fallait précisément arrêter.
   *
   * Pire, même avec du disponible : les fonds bloqués se libèrent d'eux-mêmes à
   * l'échéance du palier. Geler le seul disponible laisserait l'organisateur
   * retirer le lendemain ce qu'on venait de lui bloquer la veille.
   *
   * Le plafond est donc le TOTAL détenu. Le solde disponible peut passer
   * transitoirement en négatif — c'est le comportement voulu : à mesure que le
   * palier libère des fonds, ceux-ci sont absorbés par le gel au lieu de
   * devenir retirables.
   */
  async freezeFunds(
    organizationId: string,
    input: FreezeFundsInput,
    userId: string,
  ): Promise<{ frozen: number }> {
    const balance = await this.ledger.balance(organizationId);

    // Le plafond est le TOTAL du compte, disponible ET bloqué. Voir le
    // paragraphe « Ce qui est gelable » ci-dessus : s'arrêter au disponible
    // laisserait filer, dès le lendemain, ce que le palier libère.
    const total = balance.availableAmount + balance.pendingAmount;

    const amount = input.amount ?? total;

    if (amount <= 0) {
      throw new BadRequestException('Il n’y a rien à geler sur ce compte.');
    }

    if (amount > total) {
      throw new BadRequestException(
        `Cette organisation détient ${total} FCFA : impossible d’en geler ${amount}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.ledger.write(tx, {
        organizationId,
        type: 'FREEZE',
        amount: -amount,
        balanceState: 'AVAILABLE',
        description: `Fonds gelés · ${input.reason}`,
        metadata: { reportId: input.reportId, byUserId: userId },
      });

      // Le pendant : même montant, côté bloqué, SANS date de déblocage. Le
      // total de l'organisation ne bouge pas, l'argent change de poche, et rien
      // ne le libérera sans une décision explicite.
      await this.ledger.write(tx, {
        organizationId,
        type: 'ADJUSTMENT',
        amount,
        balanceState: 'PENDING',
        availableAt: null,
        description: `Mise sous séquestre · ${input.reason}`,
        metadata: { reportId: input.reportId, frozen: true },
      });
    });

    await this.audit.record({
      action: 'admin.funds.frozen',
      entityType: 'Organization',
      entityId: organizationId,
      actorUserId: userId,
      organizationId,
      changes: { amount, reason: input.reason, reportId: input.reportId },
    });

    this.logger.warn(`${amount} FCFA gelés sur ${organizationId} : ${input.reason}`);

    return { frozen: amount };
  }

  /** Lève un gel, en totalité ou en partie. */
  async unfreezeFunds(
    organizationId: string,
    input: UnfreezeFundsInput,
    userId: string,
  ): Promise<{ released: number }> {
    const frozen = await this.frozenAmount(organizationId);

    const amount = input.amount ?? frozen;

    if (amount <= 0 || amount > frozen) {
      throw new BadRequestException(
        frozen <= 0
          ? 'Aucun fonds n’est gelé sur ce compte.'
          : `Le montant gelé est de ${frozen} FCFA.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.ledger.write(tx, {
        organizationId,
        type: 'ADJUSTMENT',
        amount: -amount,
        balanceState: 'PENDING',
        availableAt: null,
        description: `Sortie de séquestre · ${input.reason}`,
        metadata: { unfrozen: true },
      });

      await this.ledger.write(tx, {
        organizationId,
        type: 'UNFREEZE',
        amount,
        balanceState: 'AVAILABLE',
        description: `Gel levé · ${input.reason}`,
        metadata: { byUserId: userId },
      });
    });

    await this.audit.record({
      action: 'admin.funds.unfrozen',
      entityType: 'Organization',
      entityId: organizationId,
      actorUserId: userId,
      organizationId,
      changes: { amount, reason: input.reason },
    });

    return { released: amount };
  }

  /**
   * Montant actuellement gelé.
   *
   * Somme des `FREEZE` et `UNFREEZE` : les premières sont négatives, les
   * secondes positives, donc le gel net est l'opposé de leur somme.
   */
  async frozenAmount(organizationId: string): Promise<number> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { organizationId, type: { in: ['FREEZE', 'UNFREEZE'] } },
      select: { amount: true },
    });

    const net = entries.reduce((total, entry) => total + entry.amount, 0);

    // `- 0` vaut `-0` en JavaScript, que `Object.is` distingue de `0`. Sans ce
    // `+ 0`, un compte sans gel renverrait une valeur qui n'est égale à zéro
    // que pour certains opérateurs de comparaison.
    return -net + 0;
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  /**
   * Trouve l'organisation derrière une cible.
   *
   * Renvoie `undefined` si la cible n'existe pas — distinct de `null`, qui
   * signifie « existe, mais n'appartient à aucune organisation » (le cas d'un
   * signalement visant un participant).
   */
  private async resolveOrganization(
    targetType: string,
    targetId: string,
  ): Promise<string | null | undefined> {
    if (targetType === 'ORGANIZATION') {
      const exists = await this.prisma.organization.findUnique({
        where: { id: targetId },
        select: { id: true },
      });

      return exists ? targetId : undefined;
    }

    if (targetType === 'EVENT') {
      const event = await this.prisma.event.findUnique({
        where: { id: targetId },
        select: { organizationId: true },
      });

      return event?.organizationId;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });

    // Un participant signalé ne porte aucun fonds : pas d'organisation, mais la
    // cible existe bien.
    return user ? null : undefined;
  }

  /** Nom lisible de chaque cible, en une requête par type. */
  private async labelsFor(
    reports: { targetType: string; targetId: string }[],
  ): Promise<Map<string, string>> {
    const byType = new Map<string, string[]>();

    for (const report of reports) {
      byType.set(report.targetType, [...(byType.get(report.targetType) ?? []), report.targetId]);
    }

    const labels = new Map<string, string>();

    const events = await this.prisma.event.findMany({
      where: { id: { in: byType.get('EVENT') ?? [] } },
      select: { id: true, title: true },
    });

    for (const event of events) labels.set(`EVENT:${event.id}`, event.title);

    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: byType.get('ORGANIZATION') ?? [] } },
      select: { id: true, name: true },
    });

    for (const org of organizations) labels.set(`ORGANIZATION:${org.id}`, org.name);

    const users = await this.prisma.user.findMany({
      where: { id: { in: byType.get('USER') ?? [] } },
      select: { id: true, fullName: true, phone: true },
    });

    for (const user of users) {
      labels.set(`USER:${user.id}`, user.fullName || user.phone);
    }

    return labels;
  }
}

/** `NKR-4F2A81`, sur le modèle des commandes et des retraits. */
function generateReportReference(): string {
  return `NKR-${randomBytes(3).toString('hex').toUpperCase()}`;
}
