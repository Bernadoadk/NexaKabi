import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Manifest, ManifestEntry } from '@nexakabi/contracts';
import { referenceSuffix } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TicketSigningService } from '../tickets/ticket-signing.service';

/**
 * Carnet de contrôle.
 *
 * ── Ce que le contrôleur emporte à la porte ─────────────────────────────────
 * Un fichier compact, téléchargé une fois, qui lui permet de travailler sans
 * réseau : la clé publique de l'événement pour vérifier les signatures, et la
 * liste des billets pour garantir l'unicité et afficher un nom.
 *
 * ── Minimisation des données ────────────────────────────────────────────────
 * Ce carnet part sur le téléphone PERSONNEL d'un contrôleur, souvent un
 * bénévole recruté pour la soirée. Il ne contient donc ni numéro de téléphone,
 * ni adresse e-mail, ni montant payé. Le nom suffit à confronter une pièce
 * d'identité ; quatre caractères de référence suffisent à la recherche
 * manuelle. Tout le reste serait une fuite de données organisée.
 *
 * Les clés sont d'une lettre — `p`, `n`, `c`, `s`, `t` — parce que sur 600
 * billets, des noms de champs explicites pèseraient plus lourd que les données
 * elles-mêmes.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §7.3, couche 2.
 */
@Injectable()
export class ManifestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: TicketSigningService,
  ) {}

  /**
   * Construit le carnet d'un événement.
   *
   * @param organizationId organisation du demandeur. Le filtre porte sur les
   *        DEUX identifiants : le garde vérifie déjà l'appartenance, mais un
   *        carnet livre le nom de chaque porteur de billet — c'est le genre de
   *        donnée pour laquelle une seule ligne de défense ne suffit pas.
   * @param knownVersion version déjà détenue par le client (en-tête `If-None-Match`).
   * @returns `null` si le carnet du client est à jour — rien à retélécharger.
   */
  async build(
    eventId: string,
    organizationId: string,
    knownVersion?: string,
  ): Promise<Manifest | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
      select: {
        id: true,
        title: true,
        shortCode: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!event) {
      throw new NotFoundException("Cet événement n'existe pas.");
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      select: {
        publicId: true,
        reference: true,
        attendeeName: true,
        status: true,
        usedAt: true,
        updatedAt: true,
        ticketType: { select: { name: true } },
        checkIns: {
          where: { isEffective: true, revokedAt: null },
          select: { scannedAt: true, gate: true },
          take: 1,
        },
      },
      orderBy: { reference: 'asc' },
    });

    const entries: ManifestEntry[] = tickets.map((ticket) => {
      const firstScan = ticket.checkIns[0];

      const entry: ManifestEntry = {
        p: ticket.publicId,
        n: ticket.attendeeName,
        c: ticket.ticketType.name,
        s: referenceSuffix(ticket.reference),
        t: statusFor(ticket.status, Boolean(firstScan)),
      };

      if (firstScan) {
        return {
          ...entry,
          // Secondes plutôt que millisecondes, et pas d'ISO : sur 600 entrées,
          // la différence se compte en dizaines de kilo-octets.
          a: Math.floor(firstScan.scannedAt.getTime() / 1000),
          ...(firstScan.gate ? { g: firstScan.gate } : {}),
        };
      }

      return entry;
    });

    const version = computeVersion(tickets);

    // Le client détient déjà cette version : inutile de lui renvoyer 72 Ko.
    if (knownVersion && knownVersion === version) return null;

    const key = await this.signing.findPublicKey(eventId);

    if (!key) {
      throw new NotFoundException(
        "Cet événement n'a pas encore de clé de signature : aucun billet n'a été émis.",
      );
    }

    return {
      eventId: event.id,
      eventTitle: event.title,
      eventShortCode: event.shortCode,
      eventStartsAt: event.startsAt.toISOString(),
      eventEndsAt: event.endsAt.toISOString(),
      publicKey: key.publicKey,
      keyId: key.keyId,
      /**
       * Instant du serveur, pour la correction d'horloge.
       *
       * Un téléphone mal réglé — cas courant sur un appareil d'entrée de gamme
       * sans synchronisation NTP — raflerait sinon tous les arbitrages de
       * conflit, puisque ceux-ci comparent des horodatages d'appareils.
       */
      serverTime: new Date().toISOString(),
      version,
      entries,
      expectedCount: entries.filter((entry) => entry.t !== 'x').length,
      checkedInCount: entries.filter((entry) => entry.t === 'u').length,
    };
  }

  /** Version courante du carnet, sans le construire. Sert à l'en-tête `ETag`. */
  async currentVersion(eventId: string): Promise<string> {
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      select: { publicId: true, status: true, updatedAt: true },
      orderBy: { reference: 'asc' },
    });

    return computeVersion(tickets);
  }
}

/** `v` valide, `u` déjà entré, `x` annulé. */
function statusFor(status: string, hasEffectiveScan: boolean): ManifestEntry['t'] {
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'x';
  if (status === 'USED' || hasEffectiveScan) return 'u';
  return 'v';
}

/**
 * Empreinte du carnet.
 *
 * Calculée sur ce qui, en changeant, oblige à retélécharger : la liste des
 * billets et leur date de dernière modification. Un `updatedAt` bouge dès
 * qu'un billet est émis, annulé ou marqué entré — c'est exactement le
 * déclencheur voulu.
 */
function computeVersion(
  tickets: readonly { publicId: string; status: string; updatedAt: Date }[],
): string {
  const hash = createHash('sha256');

  hash.update(String(tickets.length));
  for (const ticket of tickets) {
    hash.update(ticket.publicId);
    hash.update(ticket.status);
    hash.update(String(ticket.updatedAt.getTime()));
  }

  return hash.digest('hex').slice(0, 16);
}
