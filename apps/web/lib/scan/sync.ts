import { SCAN_BATCH_SIZE, type SyncScansResult } from '@nexakabi/contracts';
import { markAttempt, pendingScans, settleScans, type PendingScan } from './db';

/**
 * Synchronisation des scans.
 *
 * ── La règle absolue ────────────────────────────────────────────────────────
 * **La file n'est purgée qu'après confirmation explicite du serveur**, scan par
 * scan, via les `nonce` qu'il renvoie. Purger sur « la requête est partie »
 * perdrait des entrées à la première coupure — et un participant entré mais non
 * compté peut entrer une seconde fois.
 *
 * ── Report exponentiel ──────────────────────────────────────────────────────
 * Un contrôleur avec du réseau intermittent déclencherait sinon une tentative
 * par seconde, vidant sa batterie sans rien synchroniser. Le délai double à
 * chaque échec, plafonné à une minute.
 */

export interface SyncReport {
  readonly attempted: number;
  readonly accepted: number;
  readonly conflicts: number;
  readonly rejected: number;
  readonly remaining: number;
  readonly failed: boolean;
}

const EMPTY: SyncReport = {
  attempted: 0,
  accepted: 0,
  conflicts: 0,
  rejected: 0,
  remaining: 0,
  failed: false,
};

/**
 * Envoie un lot, au plus.
 *
 * Un seul lot par appel : la boucle appartient à l'appelant, qui peut ainsi
 * l'interrompre quand le contrôleur revient au scanner. Rien ne doit passer
 * devant la caméra.
 */
export async function syncOnce(eventId: string): Promise<SyncReport> {
  const queued = await pendingScans(eventId, SCAN_BATCH_SIZE);

  /**
   * Scans antérieurs à l'ajout du jeton signé.
   *
   * Ni jeton, ni déclaration d'entrée manuelle : le serveur les refuserait
   * tous, et la file — qui n'est jamais purgée sans réponse — les rejouerait
   * indéfiniment. On les évacue en les marquant rejetés : mieux vaut un scan
   * perdu et consigné qu'une file qui ne se vide plus jamais.
   */
  const legacy = queued.filter((scan) => !scan.qrToken && !scan.manualEntry);

  if (legacy.length > 0) {
    await settleScans(legacy.map((scan) => ({ nonce: scan.nonce, outcome: 'rejected' })));
  }

  const batch = queued.filter((scan) => scan.qrToken || scan.manualEntry);

  if (batch.length === 0) return EMPTY;

  try {
    const response = await fetch(`/api/scan/${encodeURIComponent(eventId)}/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scans: batch.map(toScanRecord) }),
    });

    if (!response.ok) {
      await markAttempt(batch.map((scan) => scan.nonce));
      return { ...EMPTY, attempted: batch.length, remaining: batch.length, failed: true };
    }

    const result = (await response.json()) as SyncScansResult;

    // Seuls les `nonce` que le serveur a explicitement traités quittent la file.
    await settleScans(result.results);

    const remaining = await pendingScans(eventId);

    return {
      attempted: batch.length,
      accepted: result.accepted,
      conflicts: result.conflicts,
      rejected: result.rejected,
      remaining: remaining.length,
      failed: false,
    };
  } catch {
    // Réseau coupé en plein envoi : la file reste intacte, on réessaiera.
    await markAttempt(batch.map((scan) => scan.nonce));
    return { ...EMPTY, attempted: batch.length, remaining: batch.length, failed: true };
  }
}

/** Vide la file, lot après lot, tant que le serveur répond. */
export async function drainQueue(eventId: string): Promise<SyncReport> {
  let total: SyncReport = EMPTY;

  for (let pass = 0; pass < 20; pass += 1) {
    const report = await syncOnce(eventId);

    total = {
      attempted: total.attempted + report.attempted,
      accepted: total.accepted + report.accepted,
      conflicts: total.conflicts + report.conflicts,
      rejected: total.rejected + report.rejected,
      remaining: report.remaining,
      failed: report.failed,
    };

    if (report.failed || report.attempted === 0 || report.remaining === 0) break;
  }

  return total;
}

/** Délai avant la prochaine tentative, en millisecondes. */
export function backoffDelay(attempts: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.min(attempts, 5));
}

function toScanRecord(scan: PendingScan) {
  return {
    nonce: scan.nonce,
    ticketPublicId: scan.ticketPublicId,
    // Le serveur revérifie la signature : sans ce jeton, il n'aurait qu'un
    // identifiant recopiable pour accorder une entrée.
    qrToken: scan.qrToken,
    manualEntry: scan.manualEntry,
    scannedAt: scan.scannedAt,
    gate: scan.gate,
    deviceId: scan.deviceId,
    wasOffline: scan.wasOffline,
    overridden: scan.overridden,
  };
}
