import type { PushStatus } from '@nexakabi/contracts';

/**
 * Notifications sur l'appareil, côté navigateur.
 *
 * ── Le service worker, et pourquoi deux adresses ────────────────────────────
 * Une notification Web Push est reçue par le service worker, même page
 * fermée. En production, `sw.js` est déjà enregistré au chargement (voir
 * `PwaProvider`) et porte à la fois le cache hors ligne et la réception des
 * notifications. En développement, le cache est volontairement absent — il
 * resservirait des pages périmées après chaque recompilation — et le worker
 * est enregistré seulement quand on active les notifications, en mode
 * `?mode=push` : il reçoit, il n'intercepte rien.
 *
 * ── Trois états, et qui les change ──────────────────────────────────────────
 *  · **L'autorisation** appartient au navigateur : on ne la demande qu'au toucher
 *    d'un bouton, jamais au chargement d'une page, et un refus ne se redemande
 *    pas.
 *  · **L'abonnement** appartient à l'appareil : il disparaît à la déconnexion
 *    (un téléphone prêté ne doit pas continuer à afficher les alertes du compte),
 *    et `syncThisDevice` le rétablit seul à la connexion suivante.
 *  · **Le refus explicite** — l'interrupteur coupé dans les réglages — appartient
 *    à la personne. Il est mémorisé, et la resynchronisation le respecte : sans
 *    cela, couper les notifications ne servirait qu'à les voir revenir au
 *    chargement suivant.
 */

const SERVICE_WORKER_URL = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js?mode=push';

/** Clé du refus explicite. Posée en coupant l'interrupteur, levée en le rallumant. */
const OPT_OUT_KEY = 'nk_push_optout';

/** Clé de la dernière resynchronisation réussie : qui, et quand. */
const SYNC_KEY = 'nk_push_sync';

/** Une resynchronisation toutes les six heures suffit : l'abonnement ne bouge pas souvent. */
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type PushSupport = 'supported' | 'unsupported' | 'install-first';

/** Ce navigateur sait-il recevoir des notifications ? */
export function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';

  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if (hasApis) return 'supported';

  // Sur iPhone, Safari n'offre le push qu'à une application installée sur
  // l'écran d'accueil : le dire vaut mieux que « non pris en charge ».
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return isIos ? 'install-first' : 'unsupported';
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
  }
  return navigator.serviceWorker.ready;
}

/** L'abonnement de CET appareil, s'il existe. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (detectPushSupport() !== 'supported') return null;

  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing ? existing.pushManager.getSubscription() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mémoire locale
// ─────────────────────────────────────────────────────────────────────────────

/** Le stockage local peut lever — navigation privée, réglages restrictifs. */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Sans mémoire, le réglage vaut pour cette page seulement. C'est regrettable,
    // jamais bloquant.
  }
}

/** La personne a-t-elle coupé les notifications de cet appareil ? */
export function hasOptedOutOfPush(): boolean {
  return readStorage(OPT_OUT_KEY) === '1';
}

export function setPushOptOut(optedOut: boolean): void {
  writeStorage(OPT_OUT_KEY, optedOut ? '1' : null);
}

function recentlySynced(userId: string): boolean {
  const raw = readStorage(SYNC_KEY);
  if (!raw) return false;

  try {
    const memo = JSON.parse(raw) as { u?: unknown; t?: unknown };
    return (
      memo.u === userId && typeof memo.t === 'number' && Date.now() - memo.t < SYNC_INTERVAL_MS
    );
  } catch {
    return false;
  }
}

function rememberSync(userId: string): void {
  writeStorage(SYNC_KEY, JSON.stringify({ u: userId, t: Date.now() }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Abonnement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Active les notifications sur cet appareil.
 *
 * Demande l'autorisation au navigateur — c'est lui qui pose la question, une
 * seule fois : un refus ne se redemande pas, il se corrige dans les réglages
 * du site. D'où le soin de ne l'appeler qu'au toucher d'un bouton, jamais
 * au chargement d'une page.
 */
export async function subscribeThisDevice(
  publicKey: string,
): Promise<'subscribed' | 'denied' | 'dismissed' | 'failed'> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'dismissed';

  // Une personne qui rallume l'interrupteur lève son refus : la resynchronisation
  // peut de nouveau veiller sur l'appareil.
  setPushOptOut(false);

  const worker = await registration();
  const subscription = await subscribeWithKey(worker, publicKey);
  const registered = await registerOnServer(subscription);

  if (!registered) {
    // Un abonnement que le serveur ne connaît pas ne recevra jamais rien :
    // le garder ferait croire que tout est en place.
    await subscription.unsubscribe().catch(() => undefined);
    return 'failed';
  }

  return 'subscribed';
}

/**
 * Remet l'appareil en règle, sans rien demander à personne.
 *
 * ── Le trou que ceci bouche ─────────────────────────────────────────────────
 * La déconnexion désabonne l'appareil, et rien ne le réabonnait à la connexion :
 * après un simple « se déconnecter, se reconnecter », les notifications étaient
 * coupées sans que personne le sache. Une application installée ne se comporte
 * pas ainsi — l'autorisation, elle, est toujours donnée.
 *
 * Ne fait RIEN sans autorisation déjà accordée : le navigateur ne laisse
 * demander qu'au geste d'une personne, et on ne tente pas de le contourner. Ne
 * fait rien non plus pour qui a coupé l'interrupteur.
 *
 * Repart au plus une fois toutes les six heures par compte et par appareil, sauf
 * si `force`. Un changement de compte sur le même appareil repart tout de suite :
 * l'adresse de l'appareil passe alors au nouveau compte côté serveur.
 */
export async function syncThisDevice(
  userId: string,
  options: { force?: boolean } = {},
): Promise<'skipped' | 'synced' | 'failed'> {
  if (detectPushSupport() !== 'supported') return 'skipped';
  if (Notification.permission !== 'granted') return 'skipped';
  if (hasOptedOutOfPush()) return 'skipped';
  if (!options.force && recentlySynced(userId)) return 'skipped';

  const status = await fetchPushStatus();
  if (!status?.publicKey) return 'skipped';

  const worker = await registration();

  // Rend l'abonnement existant, ou en crée un — et, si la clé du serveur a changé
  // depuis (un autre environnement, une rotation), repart d'un abonnement neuf.
  const subscription = await subscribeWithKey(worker, status.publicKey);

  // L'inscrire à chaque passage, même inchangé : le serveur le retire après
  // quelques échecs, et c'est le seul moyen pour l'appareil de le lui redire.
  if (!(await registerOnServer(subscription))) return 'failed';

  rememberSync(userId);
  return 'synced';
}

/**
 * Désactive les notifications sur cet appareil — aussi appelé à la
 * déconnexion : un téléphone prêté ne doit pas continuer à recevoir les
 * alertes de la personne qui s'en est servie.
 *
 * Ne pose PAS le refus explicite : se déconnecter n'est pas dire « plus de
 * notifications ». C'est `PushRow`, au toucher de l'interrupteur, qui le pose.
 */
export async function unsubscribeThisDevice(): Promise<void> {
  // La mémoire de resynchronisation tombe avec l'abonnement : la prochaine
  // connexion, même du même compte, doit le rétablir sans attendre six heures.
  writeStorage(SYNC_KEY, null);

  const subscription = await currentPushSubscription().catch(() => null);
  if (!subscription) return;

  await fetch('/api/me/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe().catch(() => undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pastille de l'icône
// ─────────────────────────────────────────────────────────────────────────────

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Pastille de l'icône de l'application : le nombre de notifications non lues.
 *
 * L'API n'existe que pour une application installée. Partout ailleurs, ne rien
 * faire est la bonne réponse — et un échec ne doit jamais se voir.
 */
export async function applyAppBadge(unread: number): Promise<void> {
  if (typeof navigator === 'undefined') return;

  const nav = navigator as BadgingNavigator;

  try {
    if (unread > 0 && nav.setAppBadge) await nav.setAppBadge(unread);
    else if (unread <= 0 && nav.clearAppBadge) await nav.clearAppBadge();
  } catch {
    // La pastille est un confort.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internes
// ─────────────────────────────────────────────────────────────────────────────

async function fetchPushStatus(): Promise<PushStatus | null> {
  try {
    const response = await fetch('/api/me/push', { cache: 'no-store' });
    return response.ok ? ((await response.json()) as PushStatus) : null;
  } catch {
    return null;
  }
}

async function registerOnServer(subscription: PushSubscription): Promise<boolean> {
  try {
    const response = await fetch('/api/me/push/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Un abonnement fait avec LA clé du serveur.
 *
 * Un abonnement est lié à la clé publique avec laquelle il a été créé. Si le
 * serveur en présente une autre — la paire de développement remplacée par celle
 * de production, une rotation —, l'abonnement existant ne recevrait plus rien :
 * il est défait et refait avec la bonne clé.
 */
async function subscribeWithKey(
  worker: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  const expected = base64UrlToBytes(publicKey);
  const existing = await worker.pushManager.getSubscription();

  if (existing) {
    const held = existing.options.applicationServerKey;

    if (held && sameBytes(new Uint8Array(held), expected)) return existing;

    await existing.unsubscribe().catch(() => undefined);
  }

  return worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expected,
  });
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

/** Clé publique VAPID (base64url) → octets, format attendu par `PushManager`. */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));

  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }

  return bytes;
}
