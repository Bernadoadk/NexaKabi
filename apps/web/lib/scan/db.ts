import Dexie, { type Table } from 'dexie';
import type { Manifest, ManifestEntry, ScanRecord } from '@nexakabi/contracts';

/**
 * Stockage local du scanner.
 *
 * ── Pourquoi IndexedDB et pas autre chose ───────────────────────────────────
 * La file de scans doit survivre à un rechargement de page, à la fermeture de
 * l'application, et à un téléphone qui s'éteint faute de batterie au milieu de
 * l'événement. `localStorage` serait synchrone (donc bloquerait le rendu du
 * scanner) et plafonné à 5 Mo ; la mémoire ne survivrait à rien.
 *
 * ── La règle qui gouverne ce fichier ────────────────────────────────────────
 * **La file n'est JAMAIS purgée avant confirmation du serveur.** Perdre un scan
 * signifie qu'un participant entré ne sera pas compté — et, pire, qu'il pourra
 * entrer une seconde fois. Toutes les opérations d'écriture ci-dessous sont
 * conçues autour de cette contrainte.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §8.5.
 */

/** Carnet mis en cache, avec sa correction d'horloge. */
export interface StoredManifest {
  eventId: string;
  manifest: Manifest;
  /**
   * Écart entre l'horloge du téléphone et celle du serveur, en millisecondes.
   *
   * Mesuré au téléchargement du carnet. Sans lui, l'arbitrage « le plus ancien
   * gagne » comparerait des horloges non comparables : un téléphone en retard
   * de dix minutes raflerait tous les arbitrages.
   */
  clockOffsetMs: number;
  fetchedAt: number;
}

/** Scan en attente d'envoi. */
export interface PendingScan extends ScanRecord {
  eventId: string;
  /** Nom affiché au contrôleur dans l'historique local. */
  attendeeName: string;
  ticketSuffix: string;
  /** Nombre d'échecs d'envoi, pour le report exponentiel. */
  attempts: number;
  createdAt: number;
}

/** Scan déjà synchronisé, conservé pour l'historique de session (écran C7). */
export interface SyncedScan {
  nonce: string;
  eventId: string;
  attendeeName: string;
  ticketSuffix: string;
  scannedAt: string;
  outcome: string;
  syncedAt: number;
}

class ScannerDatabase extends Dexie {
  manifests!: Table<StoredManifest, string>;
  pending!: Table<PendingScan, string>;
  synced!: Table<SyncedScan, string>;

  constructor() {
    super('nexakabi-scanner');

    this.version(1).stores({
      manifests: 'eventId',
      // Indexé par événement ET par identifiant de billet : le second permet de
      // savoir en O(1) si ce billet a déjà été scanné pendant cette session,
      // avant même la moindre synchronisation.
      pending: 'nonce, eventId, ticketPublicId',
      synced: 'nonce, eventId, syncedAt',
    });
  }
}

let database: ScannerDatabase | null = null;

/**
 * Base locale, créée à la demande.
 *
 * Jamais à l'import : ce module est aussi évalué pendant le rendu serveur, où
 * `indexedDB` n'existe pas.
 */
export function scannerDb(): ScannerDatabase {
  database ??= new ScannerDatabase();
  return database;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carnet
// ─────────────────────────────────────────────────────────────────────────────

export async function saveManifest(manifest: Manifest): Promise<StoredManifest> {
  const stored: StoredManifest = {
    eventId: manifest.eventId,
    manifest,
    clockOffsetMs: new Date(manifest.serverTime).getTime() - Date.now(),
    fetchedAt: Date.now(),
  };

  await scannerDb().manifests.put(stored);
  return stored;
}

export async function loadManifest(eventId: string): Promise<StoredManifest | undefined> {
  return scannerDb().manifests.get(eventId);
}

/**
 * Index des entrées par identifiant public.
 *
 * Construit une seule fois à l'ouverture du scanner : chercher dans un tableau
 * de 600 entrées à chaque scan ajouterait des millisecondes là où le budget
 * total est d'une seconde, verdict affiché compris.
 */
export function indexManifest(manifest: Manifest): Map<string, ManifestEntry> {
  return new Map(manifest.entries.map((entry) => [entry.p, entry]));
}

// ─────────────────────────────────────────────────────────────────────────────
// File de scans
// ─────────────────────────────────────────────────────────────────────────────

export async function enqueueScan(scan: PendingScan): Promise<void> {
  await scannerDb().pending.put(scan);
}

export async function pendingScans(eventId: string, limit?: number): Promise<PendingScan[]> {
  const query = scannerDb().pending.where('eventId').equals(eventId);
  const scans = await query.toArray();

  // Ordre chronologique : le plus ancien part en premier, ce qui lui donne la
  // meilleure chance de gagner un éventuel arbitrage.
  scans.sort((a, b) => a.createdAt - b.createdAt);

  return limit === undefined ? scans : scans.slice(0, limit);
}

export async function pendingCount(eventId: string): Promise<number> {
  return scannerDb().pending.where('eventId').equals(eventId).count();
}

/**
 * Ce billet a-t-il déjà été scanné sur CET appareil, sans être synchronisé ?
 *
 * Le carnet ne le sait pas encore : il date d'avant. Sans ce contrôle, un même
 * billet passerait deux fois sur le même téléphone hors ligne.
 */
export async function isLocallyScanned(eventId: string, ticketPublicId: string): Promise<boolean> {
  const found = await scannerDb()
    .pending.where('ticketPublicId')
    .equals(ticketPublicId)
    .filter((scan) => scan.eventId === eventId)
    .first();

  return found !== undefined;
}

/**
 * Retire de la file les scans confirmés par le serveur, et archive leur issue.
 *
 * Appelée UNIQUEMENT avec les `nonce` que le serveur a explicitement traités.
 * Purger sur un simple « la requête est partie » perdrait des entrées à la
 * première coupure.
 */
export async function settleScans(
  results: readonly { nonce: string; outcome: string }[],
): Promise<void> {
  const db = scannerDb();
  const nonces = results.map((result) => result.nonce);
  const scans = await db.pending.where('nonce').anyOf(nonces).toArray();
  const byNonce = new Map(scans.map((scan) => [scan.nonce, scan]));

  await db.transaction('rw', db.pending, db.synced, async () => {
    for (const result of results) {
      const scan = byNonce.get(result.nonce);
      if (!scan) continue;

      await db.synced.put({
        nonce: scan.nonce,
        eventId: scan.eventId,
        attendeeName: scan.attendeeName,
        ticketSuffix: scan.ticketSuffix,
        scannedAt: scan.scannedAt,
        outcome: result.outcome,
        syncedAt: Date.now(),
      });
    }

    await db.pending.bulkDelete(nonces);
  });
}

/** Marque un échec d'envoi, pour espacer les tentatives suivantes. */
export async function markAttempt(nonces: readonly string[]): Promise<void> {
  const db = scannerDb();

  await db.transaction('rw', db.pending, async () => {
    for (const nonce of nonces) {
      const scan = await db.pending.get(nonce);
      if (scan) await db.pending.put({ ...scan, attempts: scan.attempts + 1 });
    }
  });
}

/** Historique de la session : synchronisés et en attente, du plus récent au plus ancien. */
export async function sessionHistory(eventId: string, limit = 100): Promise<SyncedScan[]> {
  const db = scannerDb();

  const [synced, pending] = await Promise.all([
    db.synced.where('eventId').equals(eventId).toArray(),
    pendingScans(eventId),
  ]);

  const asSynced: SyncedScan[] = pending.map((scan) => ({
    nonce: scan.nonce,
    eventId: scan.eventId,
    attendeeName: scan.attendeeName,
    ticketSuffix: scan.ticketSuffix,
    scannedAt: scan.scannedAt,
    outcome: 'pending',
    syncedAt: scan.createdAt,
  }));

  return [...synced, ...asSynced]
    .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
    .slice(0, limit);
}

/** Vide le stockage d'un événement terminé. */
export async function clearEvent(eventId: string): Promise<void> {
  const db = scannerDb();

  await db.transaction('rw', db.manifests, db.pending, db.synced, async () => {
    await db.manifests.delete(eventId);
    await db.pending.where('eventId').equals(eventId).delete();
    await db.synced.where('eventId').equals(eventId).delete();
  });
}
