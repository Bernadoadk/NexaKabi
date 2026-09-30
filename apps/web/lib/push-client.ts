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
 */

const SERVICE_WORKER_URL = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js?mode=push';

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

/**
 * Active les notifications sur cet appareil.
 *
 * Demande l'autorisation au navigateur — c'est lui qui pose la question, une
 * seule fois : un refus ne se redemande pas, il se corrige dans les réglages
 * du site. D'où le soin de ne l'appeler qu'au toucher de l'interrupteur, jamais
 * au chargement d'une page.
 */
export async function subscribeThisDevice(
  publicKey: string,
): Promise<'subscribed' | 'denied' | 'dismissed' | 'failed'> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'dismissed';

  const worker = await registration();
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));

  const response = await fetch('/api/me/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) {
    // Un abonnement que le serveur ne connaît pas ne recevra jamais rien :
    // le garder ferait croire que tout est en place.
    await subscription.unsubscribe().catch(() => undefined);
    return 'failed';
  }

  return 'subscribed';
}

/**
 * Désactive les notifications sur cet appareil — aussi appelé à la
 * déconnexion : un téléphone prêté ne doit pas continuer à recevoir les
 * alertes de la personne qui s'en est servie.
 */
export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await currentPushSubscription().catch(() => null);
  if (!subscription) return;

  await fetch('/api/me/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe().catch(() => undefined);
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
