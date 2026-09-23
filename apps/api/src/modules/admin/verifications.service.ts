import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  describeFailedChecks,
  documentSpec,
  isPersonalDocument,
  type AdminDashboard,
  type DocumentType,
  type ReviewVerificationInput,
  type VerificationSummary,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { LedgerService } from '../finance/ledger.service';
import { StorageProvider } from '../media/storage.provider';
import { OutboundService } from '../notifications/outbound.service';

/**
 * Vérification des organisations, côté administration.
 *
 * ── Ce que la vérification débloque, et ce qu'elle ne bloque pas ──────────
 * Elle conditionne LE RETRAIT DES FONDS, pas la vente. Un organisateur non
 * vérifié peut publier et encaisser ; son solde reste simplement bloqué. C'est
 * la protection la plus efficace contre les faux événements — elle rend
 * l'escroquerie sans profit — sans freiner l'activité légitime d'un
 * organisateur pressé.
 *
 * Conséquence directe sur l'ordre de traitement : un dossier en attente
 * représente de l'argent qu'un organisateur réel ne peut pas toucher. La file
 * est donc triée par montant en attente, pas par ancienneté.
 */
@Injectable()
export class VerificationsService {
  private readonly logger = new Logger(VerificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbound: OutboundService,
    private readonly ledger: LedgerService,
    private readonly storage: StorageProvider,
  ) {}

  /** Dossiers en attente, les plus coûteux d'abord. */
  async listPending(): Promise<VerificationSummary[]> {
    const requests = await this.prisma.verificationRequest.findMany({
      where: { status: { in: ['PENDING', 'INCOMPLETE'] } },
      select: {
        id: true,
        organizationId: true,
        organization: { select: { name: true } },
        status: true,
        contactName: true,
        contactPhone: true,
        submittedAt: true,
        _count: { select: { documents: true } },
      },
    });

    const balances = await this.ledger.balancesFor(
      requests.map((request) => request.organizationId),
    );

    return requests
      .map((request) => ({
        id: request.id,
        organizationId: request.organizationId,
        organizationName: request.organization.name,
        status: request.status,
        contactName: request.contactName,
        contactPhone: request.contactPhone,
        submittedAt: request.submittedAt.toISOString(),
        documentCount: request._count.documents,
        pendingBalance: balances.get(request.organizationId) ?? 0,
      }))
      .sort((a, b) => {
        // À montant nul des deux côtés — un organisateur qui n'a encore rien
        // vendu — c'est l'ancienneté qui tranche : le faire attendre sans raison
        // le décourage avant son premier événement.
        const difference = b.pendingBalance - a.pendingBalance;
        return difference !== 0 ? difference : a.submittedAt.localeCompare(b.submittedAt);
      });
  }

  async getRequest(requestId: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            verificationStatus: true,
            createdAt: true,
            owner: { select: { fullName: true, phone: true, email: true } },
            payoutAccounts: {
              select: {
                type: true,
                methodCode: true,
                countryCode: true,
                accountNumber: true,
                accountHolderName: true,
                isDefault: true,
              },
            },
            _count: { select: { events: true } },
          },
        },
        documents: {
          select: {
            id: true,
            type: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            status: true,
            rejectionReason: true,
            consentVersion: true,
            consentAt: true,
            purgedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!request) throw new NotFoundException('Ce dossier n’existe pas.');

    return request;
  }

  /**
   * URL signée d'une pièce déposée, à durée limitée.
   *
   * ── Ce que ce correctif débloque ─────────────────────────────────────────
   * `StorageProvider.signedUrl()` existait déjà — construit précisément pour
   * ce cas — mais rien ne l'appelait pour une pièce de vérification : l'écran
   * affichait le nom du fichier sans jamais pouvoir l'ouvrir. C'est pourtant
   * le premier des trois contrôles que cet écran doit permettre de faire.
   *
   * Chaque consultation est tracée nommément : ces fichiers sont des pièces
   * d'identité, et « qui a regardé quoi » doit rester répondable.
   */
  async getDocumentUrl(
    requestId: string,
    documentId: string,
    adminId: string,
  ): Promise<{ url: string }> {
    const document = await this.prisma.verificationDocument.findFirst({
      where: { id: documentId, requestId },
      select: { fileKey: true, purgedAt: true, type: true },
    });

    if (!document) {
      throw new NotFoundException('Cette pièce n’existe pas.');
    }

    // Le fichier a été détruit à la décision : la ligne reste pour dire qu'il a
    // existé, pas pour être rouverte. Le dire franchement vaut mieux qu'une
    // URL signée qui mènerait à une erreur de stockage incompréhensible.
    if (document.purgedAt) {
      throw new NotFoundException(
        `Cette pièce a été détruite le ${document.purgedAt.toLocaleDateString('fr-FR')}, ` +
          'après la décision. Il faut la redemander pour la revoir.',
      );
    }

    const url = await this.storage.signedUrl(document.fileKey, 300);

    await this.audit.record({
      action: AUDIT_ACTIONS.verificationDocumentViewed,
      entityType: 'VerificationDocument',
      entityId: documentId,
      actorUserId: adminId,
      actorType: 'ADMIN',
    });

    return { url };
  }

  /**
   * Statue sur un dossier.
   *
   * ── Pourquoi les trois contrôles sont enregistrés même en cas de refus ──
   * Un dossier refusé revient souvent corrigé. Sans la trace de ce qui avait
   * été validé, le modérateur suivant réexamine tout depuis le début — y compris
   * la pièce d'identité que son collègue avait déjà acceptée.
   */
  async review(requestId: string, input: ReviewVerificationInput, userId: string): Promise<void> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        organizationId: true,
        organization: { select: { name: true, ownerId: true } },
      },
    });

    if (!request) throw new NotFoundException('Ce dossier n’existe pas.');

    if (request.status === 'VERIFIED') {
      throw new ConflictException('Cette organisation est déjà vérifiée.');
    }

    const status =
      input.decision === 'APPROVE'
        ? 'VERIFIED'
        : input.decision === 'REJECT'
          ? 'REJECTED'
          : // « Il manque une pièce » n'est pas un refus : le dossier reste
            // ouvert, l'organisateur complète, et personne ne recommence à zéro.
            'INCOMPLETE';

    let released = { events: 0, amount: 0 };

    await this.prisma.$transaction(async (tx) => {
      await tx.verificationRequest.update({
        where: { id: requestId },
        data: {
          status,
          checks: input.checks,
          decisionNote: input.note,
          reviewedAt: new Date(),
          reviewedById: userId,
          // Les pièces réclamées ne survivent pas à la décision : approuver ou
          // refuser clôt la demande, seul « il manque une pièce » en ouvre une.
          requestedDocuments: input.decision === 'REQUEST_MORE' ? input.requestedDocuments : [],
        },
      });

      const organization = await tx.organization.update({
        where: { id: request.organizationId },
        data: { verificationStatus: status },
        select: { completedEventsCount: true },
      });

      // Ce que la vérification promet, elle le tient ici : les recettes
      // encaissées avant elle, bloquées sans date, reçoivent leur date de
      // déblocage. Dans la même transaction que le changement d'état — une
      // organisation « vérifiée » dont l'argent resterait bloqué serait
      // exactement le manque que ceci corrige.
      if (status === 'VERIFIED') {
        released = await this.ledger.releaseUnverifiedHolds(tx, {
          organizationId: request.organizationId,
          completedEventsCount: organization.completedEventsCount,
        });
      }
    });

    await this.audit.record({
      action: 'admin.verification.reviewed',
      entityType: 'VerificationRequest',
      entityId: requestId,
      actorUserId: userId,
      organizationId: request.organizationId,
      changes: {
        decision: input.decision,
        checks: input.checks,
        note: input.note,
        requestedDocuments: input.requestedDocuments,
      },
    });

    if (status !== 'INCOMPLETE') {
      await this.purgePersonalDocuments(requestId, userId, request.organizationId);
    }

    if (released.events > 0) {
      await this.audit.record({
        action: AUDIT_ACTIONS.ledgerHoldReleased,
        entityType: 'Organization',
        entityId: request.organizationId,
        actorUserId: userId,
        actorType: 'ADMIN',
        organizationId: request.organizationId,
        changes: { events: released.events, amount: released.amount },
      });
    }

    await this.notifyOwner(request.organization.ownerId, {
      organizationName: request.organization.name,
      decision: input.decision,
      checks: input.checks,
      note: input.note,
      requestedDocuments: input.requestedDocuments,
    });

    this.logger.log(`Vérification ${requestId} → ${status}`);
  }

  /**
   * Détruit les pièces d'identité une fois la décision rendue.
   *
   * ── Pourquoi ce n'est pas facultatif ────────────────────────────────────
   * Une carte d'identité et une photo de visage ont servi à répondre à une
   * question : « est-ce bien cette personne ? ». La réponse donnée, elles
   * n'ont plus d'objet — et le Code du numérique béninois n'autorise leur
   * conservation que pour la durée nécessaire à la finalité. Les garder « au
   * cas où » ne protège de rien et crée le seul risque qui compte vraiment :
   * celui d'une fuite de pièces d'identité d'organisateurs.
   *
   * Les documents d'ENTITÉ restent : RCCM, IFU, récépissé, acte de création
   * viennent de registres publics, ne disent rien d'une personne, et un
   * contrôle comptable peut légitimement les redemander.
   *
   * La ligne en base survit à son fichier, datée : sans elle, le dossier ne
   * dirait plus ce qui avait été fourni, et le journal d'audit pointerait vers
   * un document dont plus rien n'attesterait l'existence.
   */
  private async purgePersonalDocuments(
    requestId: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const documents = await this.prisma.verificationDocument.findMany({
      where: { requestId, purgedAt: null },
      select: { id: true, type: true, fileKey: true },
    });

    const personal = documents.filter((document) => isPersonalDocument(document.type));
    if (personal.length === 0) return;

    const purgedAt = new Date();

    for (const document of personal) {
      // Le stockage d'abord : si la ligne était marquée détruite alors que le
      // fichier reste, plus rien n'indiquerait qu'il faut y revenir.
      await this.storage.remove(document.fileKey).catch((error: unknown) => {
        this.logger.error(
          `Pièce ${document.id} non détruite au stockage : ` +
            (error instanceof Error ? error.message : 'cause inconnue'),
        );
      });
    }

    await this.prisma.verificationDocument.updateMany({
      where: { id: { in: personal.map((document) => document.id) } },
      data: { purgedAt },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.adminVerificationDocumentsPurged,
      entityType: 'VerificationRequest',
      entityId: requestId,
      actorUserId,
      actorType: 'ADMIN',
      organizationId,
      changes: { types: personal.map((document) => document.type), count: personal.length },
    });

    this.logger.log(
      `Dossier ${requestId} : ${personal.length} pièce(s) personnelle(s) détruite(s) après décision.`,
    );
  }

  /**
   * Prévient l'organisateur.
   *
   * ── Pourquoi hors du centre de notifications ────────────────────────────
   * Le centre appartient au participant, et ses quatre types sont fermés. Une
   * décision de vérification s'adresse à un organisateur, qui suit son dossier
   * dans son espace professionnel : la faire passer sous l'étiquette
   * « paiement confirmé » serait un mensonge d'affichage. Elle part donc
   * directement, et `MessageLog` en garde la trace.
   *
   * ── Ce que le message contient ──────────────────────────────────────────
   * En cas de refus, ce qui a échoué PARMI LES TROIS CONTRÔLES, plus le mot du
   * modérateur. « Dossier incomplet » oblige à tout renvoyer ; « le nom sur la
   * pièce ne correspond pas au compte de retrait » se corrige en une fois.
   */
  private async notifyOwner(
    ownerId: string,
    input: {
      organizationName: string;
      decision: string;
      checks: ReviewVerificationInput['checks'];
      note?: string;
      requestedDocuments?: DocumentType[];
    },
  ): Promise<void> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { phone: true },
    });

    if (!owner) return;

    const approved = input.decision === 'APPROVE';

    const title = approved
      ? `${input.organizationName} est vérifiée.`
      : `Vérification de ${input.organizationName} : action requise.`;

    // Nommer les pièces dans le SMS, et pas seulement dans l'écran : c'est le
    // message que l'organisateur lit sur son téléphone, souvent le seul.
    const asked = input.requestedDocuments?.length
      ? `À fournir : ${input.requestedDocuments.map((type) => documentSpec(type).short).join(', ')}.`
      : undefined;

    const body = approved
      ? 'Tu peux maintenant demander le versement de tes recettes depuis ton espace.'
      : [...describeFailedChecks(input.checks), input.note, asked]
          .filter((line): line is string => Boolean(line))
          .join(' ');

    await this.outbound.sendDirect({
      userId: ownerId,
      phone: owner.phone,
      text: `${title}
${body}`,
    });
  }

  /**
   * Tableau de bord — écran M1.
   *
   * ── Ce qu'il affiche, et pourquoi ces chiffres-là ───────────────────────
   * Ce qui ATTEND UNE DÉCISION HUMAINE, d'abord : dossiers, signalements,
   * retraits. Puis l'activité des dernières vingt-quatre heures, qui sert à
   * repérer une anomalie — un pic de paiements échoués annonce une panne
   * opérateur avant que le support ne reçoive le premier appel.
   *
   * Pas de courbes, pas de taux de conversion : ce n'est pas un tableau de bord
   * commercial, c'est une liste de choses à faire.
   */
  async dashboard(): Promise<AdminDashboard> {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const startOfMonth = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );

    const [
      pendingEvents,
      pendingVerifications,
      openReports,
      pendingPayouts,
      payoutSum,
      freezeEntries,
      ordersLast24h,
      revenueLast24h,
      failedPaymentsLast24h,
      totalOrganizations,
      verifiedOrganizations,
      grossVolume,
      eventsPublishedThisMonth,
      refundsToProcess,
    ] = await Promise.all([
      this.prisma.event.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
      this.prisma.verificationRequest.count({
        where: { status: { in: ['PENDING', 'INCOMPLETE'] } },
      }),
      this.prisma.report.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } }),
      this.prisma.payout.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      this.prisma.payout.aggregate({
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
        _sum: { netAmount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { type: { in: ['FREEZE', 'UNFREEZE'] } },
        _sum: { amount: true },
      }),
      this.prisma.order.count({
        where: { paidAt: { gte: since }, status: { in: ['PAID', 'COMPLETED'] } },
      }),
      this.prisma.order.aggregate({
        where: { paidAt: { gte: since }, status: { in: ['PAID', 'COMPLETED'] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.count({
        where: { createdAt: { gte: since }, status: { in: ['FAILED', 'EXPIRED'] } },
      }),
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { verificationStatus: 'VERIFIED' } }),
      this.prisma.ledgerEntry.aggregate({ where: { type: 'SALE' }, _sum: { amount: true } }),
      this.prisma.event.count({
        where: { deletedAt: null, publishedAt: { gte: startOfMonth } },
      }),
      // Dus et sans exécution en cours : jamais tentés, ou refusés.
      this.prisma.refund.aggregate({
        where: { status: { in: ['PENDING', 'FAILED'] } },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      pendingEvents,
      pendingVerifications,
      openReports,
      pendingPayouts,
      pendingPayoutAmount: payoutSum._sum.netAmount ?? 0,
      refundsToProcess: refundsToProcess._count,
      refundsToProcessAmount: refundsToProcess._sum.amount ?? 0,
      // Les `FREEZE` sont négatives et les `UNFREEZE` positives : le gel net est
      // l'opposé de leur somme. Le `+ 0` évite le `-0` que produit la négation
      // de zéro en JavaScript.
      frozenAmount: -(freezeEntries._sum.amount ?? 0) + 0,
      ordersLast24h,
      revenueLast24h: revenueLast24h._sum.totalAmount ?? 0,
      failedPaymentsLast24h,
      totalOrganizations,
      verifiedOrganizations,
      totalGrossVolume: grossVolume._sum.amount ?? 0,
      eventsPublishedThisMonth,
    };
  }
}
