import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AssignedEvent,
  CheckInConflictView,
  CheckInEntry,
  CheckInStats,
  EventStaffMember,
  ScanOutcome,
  ScanRecord,
  SyncScansResult,
} from '@nexakabi/contracts';
import { isScannerOpen } from '@nexakabi/contracts';
import { fromBase64Url, verifyQrToken } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { ManifestService } from './manifest.service';

/**
 * Matériel de vérification d'un événement, retenu LE TEMPS D'UN LOT.
 *
 * ── Pourquoi la portée compte ────────────────────────────────────────────
 * Un lot compte jusqu'à cinquante scans : sans mémoire, chacun rouvrirait les
 * deux mêmes lignes. Mais un cache porté par le service survivrait à toute la
 * vie du processus — et une clé d'événement régénérée après une rotation du
 * secret maître resterait invisible jusqu'au prochain redémarrage. Tous les
 * scans seraient refusés entre-temps, sans que rien n'explique pourquoi.
 *
 * Une `Map` créée à chaque appel de `sync` donne le gain sans le piège.
 */
type VerificationCache = Map<
  string,
  { publicKey: Uint8Array<ArrayBuffer>; eventShortCode: string } | null
>;

interface ScanContext {
  readonly userId: string;
  readonly eventId: string;
  /** Organisation propriétaire de l'événement, résolue par `OrgMemberGuard`. */
  readonly organizationId: string;
}

/**
 * Contrôle à l'entrée.
 *
 * ── Ce qui rend cette synchronisation difficile ─────────────────────────────
 * Les scans arrivent d'appareils qui ont travaillé HORS LIGNE, parfois pendant
 * des heures, parfois à plusieurs. Trois propriétés sont exigées, et aucune
 * n'est acquise gratuitement :
 *
 *  1. **Idempotence.** Un lot renvoyé après une coupure ne doit pas créer de
 *     doublon. Portée par l'unicité du `nonce`, tiré par l'appareil.
 *  2. **Unicité.** Un billet n'ouvre qu'une entrée, même si deux contrôleurs
 *     l'ont validé chacun de leur côté. Portée par l'index unique partiel en
 *     base — pas par ce code.
 *  3. **Arbitrage.** Quand deux scans se disputent un billet, le plus ancien
 *     gagne, l'autre est consigné comme conflit. Jamais une erreur affichée au
 *     contrôleur : il ne peut rien y faire pendant l'événement.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §7.4 et §8.5.
 */
@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly manifest: ManifestService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Vérifie le jeton QR contre la clé publique de l'événement.
   *
   * Ne lève jamais : chaque anomalie devient une issue de scan, parce qu'un lot
   * doit toujours pouvoir être purgé de la file du contrôleur. Le message rendu
   * est celui que le prototype affiche déjà pour ce verdict.
   */
  private async verifySignature(
    eventId: string,
    qrToken: string,
    cache: VerificationCache,
  ): Promise<{ valid: true; ticketPublicId: string } | { valid: false; reason: string }> {
    let material = cache.get(eventId);

    if (material === undefined) {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { shortCode: true, signingKey: { select: { publicKey: true } } },
      });

      material = event?.signingKey
        ? {
            publicKey: fromBase64Url(event.signingKey.publicKey),
            eventShortCode: event.shortCode,
          }
        : null;

      cache.set(eventId, material);
    }

    if (!material) {
      // Aucun billet émis, donc aucune clé : rien de légitime ne peut être
      // scanné pour cet événement.
      return { valid: false, reason: "Cet événement n'a pas encore de billets émis." };
    }

    const verification = await verifyQrToken(qrToken, {
      publicKey: material.publicKey,
      eventShortCode: material.eventShortCode,
    });

    if (verification.verdict === 'valid' && verification.payload) {
      return { valid: true, ticketPublicId: verification.payload.ticketPublicId };
    }

    return { valid: false, reason: verification.message };
  }

  /**
   * Vérifie que l'événement visé appartient bien à l'organisation du demandeur.
   *
   * ── Pourquoi cette vérification existe DEUX fois ────────────────────────
   * `OrgMemberGuard` résout déjà l'organisation depuis l'événement et refuse
   * une discordance. Ce contrôle-ci est la seconde ligne : ces routes livrent
   * l'identité de chaque porteur de billet et permettent d'annuler des entrées.
   * Une régression dans le garde — un paramètre de route renommé, une nouvelle
   * source d'organisation acceptée — ne doit pas suffire à ouvrir le carnet
   * d'un événement qu'on ne possède pas.
   *
   * Le message ne distingue pas « inexistant » de « pas à toi » : la
   * différence permettrait d'énumérer les événements de la plateforme.
   */
  private async assertEventBelongs(eventId: string, organizationId: string): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }
  }

  /**
   * Enregistre un lot de scans.
   *
   * Chaque scan est traité dans sa propre transaction : un billet introuvable
   * ou un conflit ne doit pas faire échouer les 49 autres. Un contrôleur qui
   * revient en ligne après trois heures ne peut pas se permettre de tout
   * perdre parce qu'un seul code était illisible.
   */
  async sync(context: ScanContext, scans: readonly ScanRecord[]): Promise<SyncScansResult> {
    await this.assertEventBelongs(context.eventId, context.organizationId);

    const results: SyncScansResult['results'] = [];

    // Traiter dans l'ordre chronologique CLIENT donne au plus ancien la
    // meilleure chance d'arriver premier, ce qui réduit le nombre de conflits
    // à arbitrer sans changer le résultat de l'arbitrage.
    const ordered = [...scans].sort(
      (a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime(),
    );

    const cache: VerificationCache = new Map();

    for (const scan of ordered) {
      results.push(await this.applyScan(context, scan, cache));
    }

    const tally = (outcome: ScanOutcome) =>
      results.filter((result) => result.outcome === outcome).length;

    const [version, checkedInCount] = await Promise.all([
      this.manifest.currentVersion(context.eventId),
      this.prisma.checkIn.count({
        where: { eventId: context.eventId, isEffective: true, revokedAt: null },
      }),
    ]);

    return {
      results,
      accepted: tally('accepted'),
      duplicates: tally('duplicate'),
      conflicts: tally('conflict'),
      rejected: tally('rejected'),
      manifestVersion: version,
      checkedInCount,
    };
  }

  /**
   * Applique un scan et rend son issue.
   *
   * Aucune exception ne remonte : chaque cas se traduit par une issue, parce
   * qu'un lot doit toujours pouvoir être purgé de la file du contrôleur.
   */
  private async applyScan(
    context: ScanContext,
    scan: ScanRecord,
    cache: VerificationCache,
  ): Promise<SyncScansResult['results'][number]> {
    const done = (outcome: ScanOutcome, reason: string | null = null) => ({
      nonce: scan.nonce,
      outcome,
      reason,
    });

    // Rejeu explicite : le lot avait déjà été reçu, la réponse s'est perdue.
    const existing = await this.prisma.checkIn.findUnique({
      where: { nonce: scan.nonce },
      select: { id: true, isEffective: true },
    });

    if (existing) {
      return done(existing.isEffective ? 'duplicate' : 'conflict', 'Scan déjà synchronisé.');
    }

    /**
     * Preuve cryptographique, AVANT toute écriture.
     *
     * Le scanner a déjà rendu son verdict hors ligne — c'est ce qui permet
     * d'ouvrir la porte en moins d'une seconde. Mais ce verdict est rendu par
     * le téléphone d'un bénévole : il ne peut pas faire autorité sur ce qu'on
     * écrit en base. Sans ce contrôle, un `ticketPublicId` recopié depuis un
     * carnet suffisait à marquer un billet comme utilisé, donc à interdire
     * l'entrée à son porteur légitime.
     */
    if (scan.qrToken) {
      const authentic = await this.verifySignature(context.eventId, scan.qrToken, cache);

      if (!authentic.valid) {
        this.logger.warn(
          { eventId: context.eventId, userId: context.userId, reason: authentic.reason },
          'Scan refusé : signature invalide',
        );

        return done('rejected', authentic.reason);
      }

      // L'identifiant annoncé doit être celui que porte le jeton signé : les
      // dissocier permettrait de présenter la signature d'un billet pour en
      // marquer un autre.
      if (authentic.ticketPublicId !== scan.ticketPublicId) {
        return done('rejected', 'Ce billet ne correspond pas au code scanné.');
      }
    } else if (!scan.manualEntry) {
      /**
       * Ni jeton, ni déclaration d'entrée manuelle.
       *
       * C'est le cas qu'il ne faut surtout pas laisser passer : sans ce refus,
       * omettre simplement `qrToken` suffirait à contourner toute la
       * vérification qu'il sert à porter.
       */
      return done('rejected', 'Ce scan ne porte aucune preuve : rescanne le billet.');
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { publicId: scan.ticketPublicId },
      select: { id: true, eventId: true, status: true, reference: true },
    });

    if (!ticket) {
      return done('rejected', 'Billet introuvable.');
    }

    if (ticket.eventId !== context.eventId) {
      return done('rejected', 'Ce billet appartient à un autre événement.');
    }

    if (ticket.status === 'CANCELLED' || ticket.status === 'REFUNDED') {
      return done('rejected', 'Ce billet a été annulé.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.checkIn.create({
          data: {
            ticketId: ticket.id,
            eventId: context.eventId,
            scannedByUserId: context.userId,
            gate: scan.gate,
            scannedAt: new Date(scan.scannedAt),
            wasOffline: scan.wasOffline,
            deviceId: scan.deviceId,
            nonce: scan.nonce,
            isEffective: true,
          },
        });

        await tx.ticket.update({
          where: { id: ticket.id },
          data: { status: 'USED', usedAt: new Date(scan.scannedAt) },
        });

        await tx.event.update({
          where: { id: context.eventId },
          data: { checkedInCount: { increment: 1 } },
        });

        /**
         * Une entrée manuelle laisse une trace nominative.
         *
         * C'est la contrepartie du secours : accorder une entrée sans preuve
         * cryptographique reste possible, mais jamais anonyme. En cas de
         * litige — un porteur refusé alors que son billet apparaît utilisé —
         * le journal dit qui l'a saisie et quand.
         */
        if (!scan.qrToken) {
          await this.audit.record({
            action: AUDIT_ACTIONS.checkInManual,
            entityType: 'ticket',
            entityId: ticket.id,
            actorUserId: context.userId,
            changes: { reference: ticket.reference, eventId: context.eventId },
          });
        }

        return done('accepted');
      });
    } catch (error) {
      // L'index unique partiel a parlé : un scan effectif existe déjà pour ce
      // billet. C'est le cas du double scan hors ligne — pas une erreur, une
      // situation prévue.
      if (isEffectiveCheckInConflict(error)) {
        return this.resolveConflict(context, scan, ticket.id, ticket.reference);
      }

      this.logger.error({ err: error, nonce: scan.nonce }, "Échec d'enregistrement d'un scan");
      return done('rejected', 'Ce scan n’a pas pu être enregistré.');
    }
  }

  /**
   * Arbitre un double scan.
   *
   * **Le plus ancien horodatage CLIENT gagne.** C'est la seule règle qui
   * corresponde à la réalité physique : la personne est passée à la première
   * porte, pas à la seconde. L'ordre d'arrivée des synchronisations, lui, ne
   * dit rien — il dépend de qui a retrouvé du réseau en premier.
   *
   * Le perdant est enregistré comme scan NON effectif, jamais supprimé :
   * l'organisateur doit pouvoir reconstituer ce qui s'est passé, et le
   * contrôleur perdant doit apparaître dans l'historique.
   */
  private async resolveConflict(
    context: ScanContext,
    scan: ScanRecord,
    ticketId: string,
    ticketReference: string,
  ): Promise<SyncScansResult['results'][number]> {
    const incoming = new Date(scan.scannedAt);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.checkIn.findFirst({
        where: { ticketId, isEffective: true, revokedAt: null },
        select: { id: true, scannedAt: true },
      });

      /* c8 ignore next 3 -- l'entrée a disparu entre l'échec et ici : cas de course rarissime */
      if (!current) {
        return { nonce: scan.nonce, outcome: 'rejected' as const, reason: 'Entrée introuvable.' };
      }

      const incomingWins = incoming.getTime() < current.scannedAt.getTime();

      // Le nouveau scan est plus ancien : il prend la place. L'ancien devient
      // le perdant. Il faut le déclasser AVANT d'insérer, sinon l'index unique
      // partiel refuserait le nouveau.
      if (incomingWins) {
        await tx.checkIn.update({ where: { id: current.id }, data: { isEffective: false } });
      }

      const created = await tx.checkIn.create({
        data: {
          ticketId,
          eventId: context.eventId,
          scannedByUserId: context.userId,
          gate: scan.gate,
          scannedAt: incoming,
          wasOffline: scan.wasOffline,
          deviceId: scan.deviceId,
          nonce: scan.nonce,
          isEffective: incomingWins,
        },
        select: { id: true },
      });

      await tx.checkInConflict.create({
        data: {
          ticketId,
          winningCheckInId: incomingWins ? created.id : current.id,
          losingCheckInId: incomingWins ? current.id : created.id,
        },
      });

      if (incomingWins) {
        await tx.ticket.update({ where: { id: ticketId }, data: { usedAt: incoming } });
      }

      this.logger.warn(
        `Double scan sur ${ticketReference} : ${incomingWins ? 'le nouveau' : "l'existant"} l'emporte`,
      );

      return {
        nonce: scan.nonce,
        outcome: 'conflict' as const,
        // Message destiné aux journaux, pas au contrôleur : le prototype
        // interdit de lui afficher un conflit pendant l'événement.
        reason: 'Ce billet avait déjà été scanné par un autre contrôleur.',
      };
    });
  }

  /**
   * Équipe de contrôle d'un événement, et ce que chacun y a fait.
   *
   * ── Qui figure dans la liste ────────────────────────────────────────────
   * Les contrôleurs assignés à cet événement, et les rôles permanents qui
   * peuvent scanner (propriétaire, administrateur, gestionnaire). Un accès
   * expiré reste listé : c'est précisément après l'événement que
   * l'organisateur vient ici, pour payer les bénévoles.
   */
  async staff(eventId: string, organizationId: string): Promise<EventStaffMember[]> {
    await this.assertEventBelongs(eventId, organizationId);

    const members = await this.prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        OR: [
          { role: { in: ['OWNER', 'ADMIN', 'MANAGER'] } },
          { role: 'SCANNER', scopedEventIds: { has: eventId } },
        ],
      },
      select: {
        userId: true,
        role: true,
        gate: true,
        expiresAt: true,
        user: { select: { fullName: true, phone: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    const activity = await this.prisma.checkIn.groupBy({
      by: ['scannedByUserId'],
      where: { eventId, isEffective: true, revokedAt: null },
      _count: { _all: true },
      _min: { scannedAt: true },
      _max: { scannedAt: true },
    });

    const byUser = new Map(activity.map((row) => [row.scannedByUserId, row]));

    return members.map((member) => {
      const scans = byUser.get(member.userId);

      return {
        userId: member.userId,
        fullName: member.user.fullName,
        phone: member.user.phone,
        role: member.role,
        gate: member.gate,
        accessEndsAt: member.expiresAt?.toISOString() ?? null,
        scanCount: scans?._count._all ?? 0,
        firstScanAt: scans?._min.scannedAt?.toISOString() ?? null,
        lastScanAt: scans?._max.scannedAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Événements que cet utilisateur peut scanner (écran C1).
   *
   * ── Deux portées, et la différence compte ───────────────────────────────
   * Un membre au rôle CONTRÔLEUR est presque toujours limité à un ou deux
   * événements précis (`scopedEventIds`) : c'est un bénévole recruté pour une
   * soirée, pas un permanent. Les autres rôles habilités au scan — propriétaire,
   * administrateur, gestionnaire — voient tous les événements de leur
   * organisation.
   *
   * Ignorer `scopedEventIds` donnerait à un bénévole d'un soir la liste
   * complète des événements de l'organisation, et l'accès à leurs carnets.
   */
  async assignedEvents(userId: string, now = new Date()): Promise<AssignedEvent[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN', 'MANAGER', 'SCANNER'] },
        // Un accès expiré ne liste plus rien : le bénévole d'hier soir ne doit
        // pas garder le carnet de l'événement sous les yeux.
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        organizationId: true,
        organization: { select: { name: true } },
        role: true,
        scopedEventIds: true,
        gate: true,
      },
    });

    if (memberships.length === 0) return [];

    const results: AssignedEvent[] = [];

    for (const membership of memberships) {
      const scoped = membership.scopedEventIds.length > 0;

      const events = await this.prisma.event.findMany({
        where: {
          organizationId: membership.organizationId,
          deletedAt: null,
          status: { in: ['PUBLISHED', 'COMPLETED'] },
          ...(scoped ? { id: { in: membership.scopedEventIds } } : {}),
          // Les événements passés depuis plus d'un jour n'ont plus lieu d'être
          // scannés, et encombreraient un écran conçu pour choisir vite.
          endsAt: { gte: new Date(now.getTime() - 24 * 3_600_000) },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          doorsOpenAt: true,
          checkedInCount: true,
          venue: { select: { name: true } },
          city: { select: { name: true } },
          _count: { select: { tickets: true } },
        },
        orderBy: { startsAt: 'asc' },
      });

      for (const event of events) {
        results.push({
          eventId: event.id,
          organizationId: membership.organizationId,
          organizationName: membership.organization.name,
          title: event.title,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          doorsOpenAt: event.doorsOpenAt?.toISOString() ?? null,
          venueName: event.venue?.name ?? null,
          cityName: event.city?.name ?? null,
          gate: membership.gate,
          expectedCount: event._count.tickets,
          checkedInCount: event.checkedInCount,
          isOpen: isScannerOpen({ startsAt: event.startsAt, endsAt: event.endsAt }, now),
        });
      }
    }

    return results.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Vue organisateur
  // ───────────────────────────────────────────────────────────────────────────

  async stats(eventId: string, organizationId: string): Promise<CheckInStats> {
    await this.assertEventBelongs(eventId, organizationId);

    const [expected, checkedIn, offline, conflicts, last] = await Promise.all([
      this.prisma.ticket.count({ where: { eventId, status: { in: ['VALID', 'USED'] } } }),
      this.prisma.checkIn.count({ where: { eventId, isEffective: true, revokedAt: null } }),
      this.prisma.checkIn.count({ where: { eventId, wasOffline: true } }),
      this.prisma.checkInConflict.count({
        where: { ticket: { eventId }, resolvedAt: null },
      }),
      this.prisma.checkIn.findFirst({
        where: { eventId, isEffective: true, revokedAt: null },
        orderBy: { scannedAt: 'desc' },
        select: { scannedAt: true },
      }),
    ]);

    return {
      expectedCount: expected,
      checkedInCount: checkedIn,
      offlineScans: offline,
      unresolvedConflicts: conflicts,
      lastCheckInAt: last?.scannedAt.toISOString() ?? null,
    };
  }

  async history(eventId: string, organizationId: string, limit = 100): Promise<CheckInEntry[]> {
    await this.assertEventBelongs(eventId, organizationId);

    const entries = await this.prisma.checkIn.findMany({
      where: { eventId },
      orderBy: { scannedAt: 'desc' },
      take: limit,
      include: {
        ticket: {
          select: {
            reference: true,
            attendeeName: true,
            ticketType: { select: { name: true } },
          },
        },
        scannedBy: { select: { fullName: true, phone: true } },
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      ticketReference: entry.ticket.reference,
      attendeeName: entry.ticket.attendeeName,
      ticketTypeName: entry.ticket.ticketType.name,
      scannedAt: entry.scannedAt.toISOString(),
      recordedAt: entry.recordedAt.toISOString(),
      gate: entry.gate,
      // Un contrôleur bénévole n'a pas toujours renseigné son nom : le numéro
      // vaut mieux qu'une ligne vide dans un historique d'audit.
      scannedByName: entry.scannedBy.fullName || entry.scannedBy.phone,
      wasOffline: entry.wasOffline,
      isEffective: entry.isEffective,
      revokedAt: entry.revokedAt?.toISOString() ?? null,
    }));
  }

  async conflicts(eventId: string, organizationId: string): Promise<CheckInConflictView[]> {
    await this.assertEventBelongs(eventId, organizationId);

    const conflicts = await this.prisma.checkInConflict.findMany({
      where: { ticket: { eventId } },
      orderBy: { detectedAt: 'desc' },
      include: {
        ticket: { select: { reference: true, attendeeName: true } },
        winningCheckIn: {
          select: {
            scannedAt: true,
            gate: true,
            scannedBy: { select: { fullName: true, phone: true } },
          },
        },
        losingCheckIn: {
          select: {
            scannedAt: true,
            gate: true,
            scannedBy: { select: { fullName: true, phone: true } },
          },
        },
      },
    });

    return conflicts.map((conflict) => ({
      id: conflict.id,
      ticketReference: conflict.ticket.reference,
      attendeeName: conflict.ticket.attendeeName,
      detectedAt: conflict.detectedAt.toISOString(),
      resolvedAt: conflict.resolvedAt?.toISOString() ?? null,
      winning: {
        scannedAt: conflict.winningCheckIn.scannedAt.toISOString(),
        gate: conflict.winningCheckIn.gate,
        scannedByName:
          conflict.winningCheckIn.scannedBy.fullName || conflict.winningCheckIn.scannedBy.phone,
      },
      losing: {
        scannedAt: conflict.losingCheckIn.scannedAt.toISOString(),
        gate: conflict.losingCheckIn.gate,
        scannedByName:
          conflict.losingCheckIn.scannedBy.fullName || conflict.losingCheckIn.scannedBy.phone,
      },
    }));
  }

  /**
   * Annule une entrée.
   *
   * « Scanné par erreur », « refusé à la porte ». Le billet redevient
   * scannable : l'index unique partiel ignore les entrées révoquées, ce qui
   * rend la correction possible sans intervention en base.
   */
  async revoke(
    eventId: string,
    organizationId: string,
    checkInId: string,
    userId: string,
    reason: string,
  ): Promise<CheckInEntry> {
    await this.assertEventBelongs(eventId, organizationId);

    const entry = await this.prisma.checkIn.findFirst({
      where: { id: checkInId, eventId },
      select: { id: true, ticketId: true, isEffective: true, revokedAt: true },
    });

    if (!entry) {
      throw new NotFoundException("Cette entrée n'existe pas.");
    }

    if (entry.revokedAt) {
      throw new BadRequestException('Cette entrée est déjà annulée.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.checkIn.update({
        where: { id: checkInId },
        data: { revokedAt: new Date(), revokedByUserId: userId, revokeReason: reason },
      });

      // Le billet ne redevient valide que si c'était SON entrée effective.
      // Annuler un scan perdant ne doit rien changer à l'état du billet.
      if (entry.isEffective) {
        await tx.ticket.update({
          where: { id: entry.ticketId },
          data: { status: 'VALID', usedAt: null },
        });

        await tx.event.update({
          where: { id: eventId },
          data: { checkedInCount: { decrement: 1 } },
        });
      }
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.checkInRevoked,
      entityType: 'check_in',
      entityId: checkInId,
      actorUserId: userId,
      changes: { reason },
    });

    const [updated] = await this.history(eventId, organizationId, 1);

    /* c8 ignore next -- l'entrée vient d'être écrite */
    if (!updated) throw new NotFoundException("Cette entrée n'existe pas.");

    return updated;
  }
}

/** Nom de l'index unique partiel, tel que déclaré dans la migration. */
const EFFECTIVE_CHECKIN_INDEX = 'check_in_one_effective_per_ticket';

/**
 * L'index unique partiel a rejeté l'écriture.
 *
 * On vise CET index précisément : une violation sur le `nonce` signifie tout
 * autre chose — un rejeu — et se traite plus haut.
 *
 * ── Où trouver le nom de l'index ────────────────────────────────────────────
 * Pas dans `meta.target`, contrairement à ce que suggère la documentation de
 * Prisma. Avec un adaptateur de pilote (`@prisma/adapter-pg`), l'erreur native
 * de PostgreSQL est transportée dans `meta.driverAdapterError.cause`, et
 * `meta.target` reste indéfini. Chercher au mauvais endroit fait silencieusement
 * échouer la détection : les doubles scans étaient alors rejetés au lieu d'être
 * arbitrés, et aucun conflit n'était remonté à l'organisateur.
 *
 * Le message sert de second recours, au cas où cette forme évoluerait : mieux
 * vaut une comparaison de chaîne redondante qu'une garantie qui disparaît sans
 * bruit à la prochaine montée de version.
 */
function isEffectiveCheckInConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if ((error as { code: unknown }).code !== 'P2002') return false;

  const meta = (error as { meta?: Record<string, unknown> }).meta;
  const cause = (meta?.driverAdapterError as { cause?: Record<string, unknown> } | undefined)
    ?.cause;
  const index = (cause?.constraint as { index?: unknown } | undefined)?.index;

  if (typeof index === 'string') return index === EFFECTIVE_CHECKIN_INDEX;

  return String((error as { message?: unknown }).message ?? '').includes(EFFECTIVE_CHECKIN_INDEX);
}
