/**
 * Service worker du participant.
 *
 * ── L'ordre de priorité du cache, et rien d'autre ───────────────────────────
 * Le prototype le fixe explicitement :
 *
 *   1. Les billets à venir et leurs QR signés
 *   2. La coque de l'application
 *   3. Le dernier écran de découverte consulté
 *
 * « Un cache trop large sur un Android d'entrée de gamme se traduit par une
 * application désinstallée. » Ni images d'événements, ni pages légales, ni
 * catalogue complet. Le budget est de 1,2 Mo pour la coque.
 *
 * ── Trois stratégies, une par nature de contenu ─────────────────────────────
 *  · **Les billets** : cache d'abord, revalidation en arrière-plan. Un billet
 *    doit s'afficher instantanément et sans réseau — c'est sa raison d'être.
 *  · **La coque et les ressources** : cache d'abord aussi, mais elles portent
 *    un nom haché : une nouvelle version a une nouvelle URL, jamais de conflit.
 *  · **La découverte** : réseau d'abord, cache en secours. Un catalogue périmé
 *    vaut mieux qu'une page blanche, mais un catalogue à jour vaut mieux encore.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §8.1 et §8.2.
 */

const VERSION = 'v1';
const SHELL_CACHE = `nexakabi-shell-${VERSION}`;
const TICKETS_CACHE = `nexakabi-tickets-${VERSION}`;
const PAGES_CACHE = `nexakabi-pages-${VERSION}`;

/**
 * Mode « notifications seulement » (`/sw.js?mode=push`).
 *
 * En développement, le cache est volontairement absent : il resservirait des
 * pages périmées après chaque recompilation (voir `PwaProvider`). Le worker
 * n'y est enregistré que pour recevoir les notifications, et n'intercepte
 * alors aucune requête.
 */
const PUSH_ONLY = new URL(self.location.href).searchParams.get('mode') === 'push';

const KNOWN_CACHES = [SHELL_CACHE, TICKETS_CACHE, PAGES_CACHE];

/** Nombre d'écrans de découverte conservés. Au-delà, on gaspille du stockage. */
const MAX_PAGES = 5;

self.addEventListener('install', (event) => {
  // Pas de pré-chargement : les ressources de Next portent des noms hachés
  // impossibles à énumérer ici. Elles entrent en cache à la première visite,
  // qui a lieu en ligne par définition.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !KNOWN_CACHES.includes(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (PUSH_ONLY) return;

  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Le scanner a son propre service worker, avec une stratégie opposée.
  if (url.pathname.startsWith('/scan')) return;

  // Les appels d'API ne sont jamais mis en cache : une commande, un paiement ou
  // un solde servi depuis un cache serait pire qu'une erreur réseau.
  if (url.pathname.startsWith('/api/')) return;

  // ── 1. Les billets ────────────────────────────────────────────────────────
  if (isTicketRoute(url.pathname)) {
    event.respondWith(cacheFirst(request, TICKETS_CACHE));
    return;
  }

  // ── 2. La coque ───────────────────────────────────────────────────────────
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // ── 3. La découverte ──────────────────────────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  }
});

// ── Notifications sur l'appareil ────────────────────────────────────────────
//
// Le serveur envoie un message versionné, chiffré de bout en bout : seul ce
// navigateur peut le lire. Sa définition unique est `pushPayloadSchema`, dans
// `packages/contracts/src/notifications.ts` — ce fichier n'en est que le
// lecteur.
//
// ── Un lecteur, pas un décideur ─────────────────────────────────────────────
// Ce worker ne connaît AUCUN type de notification. Il applique ce que le message
// décrit — étiquette, urgence, silence, bouton, image — et rien d'autre. Changer
// l'allure d'une notification se fait donc côté serveur, sans attendre que chaque
// téléphone ait mis à jour son worker.
//
// ── Ce qui fait l'allure d'une application, et pas d'un site ────────────────
//  · une ÉTIQUETTE par histoire : la notification suivante REMPLACE la
//    précédente et resonne, au lieu de s'empiler dix fois ;
//  · une PASTILLE sur l'icône de l'application, qui compte les non lues ;
//  · des BOUTONS : l'action principale, et « Marquer comme lue » ;
//  · le TOUCHER marque la notification comme lue ;
//  · l'application ouverte se met à jour toute seule ;
//  · la nuit, ce qui ne presse pas s'affiche sans son ni vibration.
//
// Toucher ouvre `url` — toujours un chemin de CE site, jamais une adresse
// extérieure, même si le contenu le prétendait.

const APP_ICON = '/icon/192';
const BADGE_ICON = '/icons/badge.png';
const ALERTS_PATH = '/mon-compte/notifications';

self.addEventListener('push', (event) => {
  event.waitUntil(showPush(event));
});

async function showPush(event) {
  const payload = readPayload(event);

  const options = {
    body: payload.body,
    icon: APP_ICON,
    badge: BADGE_ICON,
    lang: 'fr',
    dir: 'ltr',
    timestamp: payload.ts,
    silent: payload.silent,
    requireInteraction: payload.sticky,
    actions: payload.actions,
    data: { url: payload.url, id: payload.id, type: payload.type },
  };

  // `renotify` exige une étiquette non vide : le navigateur lève une erreur sinon.
  if (payload.tag) {
    options.tag = payload.tag;
    options.renotify = true;
  }

  if (payload.image) options.image = payload.image;

  // Le navigateur refuse une vibration sur une notification silencieuse.
  if (!payload.silent) {
    options.vibrate = payload.urgent ? [220, 110, 220, 110, 220] : [140, 90, 140];
  }

  await Promise.all([
    self.registration.showNotification(payload.title, options),
    setAppBadge(payload.unread),
    // Une fenêtre ouverte actualise son compteur et sa liste sans qu'on le demande.
    notifyWindows({ type: 'nk:push', unread: payload.unread }),
  ]);
}

/**
 * Lit le message, sans jamais lever : un message illisible s'affiche quand même,
 * avec ce qu'on en sauve — mieux qu'un téléphone qui ne dit rien, et qu'un
 * navigateur qui finit par retirer l'autorisation à un site dont les messages
 * n'affichent rien.
 */
function readPayload(event) {
  let raw = {};

  try {
    raw = event.data ? event.data.json() : {};
  } catch {
    raw = { body: event.data ? event.data.text() : '' };
  }

  if (!raw || typeof raw !== 'object') raw = {};

  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  const actions = [];

  const actionLabel = text(raw.actionLabel, 32);
  if (actionLabel) actions.push({ action: 'open', title: actionLabel });
  if (raw.canMarkRead === true) actions.push({ action: 'read', title: 'Marquer comme lue' });

  const unread = Number(raw.unread);
  const ts = Number(raw.ts);

  return {
    title: text(raw.title, 120) || 'Nexa-Kabi',
    body: text(raw.body, 300),
    url: internalPath(raw.url),
    tag: text(raw.tag, 160),
    id: typeof raw.id === 'string' && raw.id ? raw.id : null,
    type: text(raw.type, 40),
    unread: Number.isFinite(unread) && unread >= 0 ? Math.trunc(unread) : null,
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
    // Une image ne se charge qu'en `https` : sur toute autre origine, le navigateur
    // refuserait d'afficher la notification entière.
    image: typeof raw.image === 'string' && raw.image.startsWith('https://') ? raw.image : null,
    urgent: raw.urgent === true,
    sticky: raw.sticky === true,
    silent: raw.silent === true,
    actions: actions.slice(0, 2),
  };
}

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};

  notification.close();

  event.waitUntil(
    (async () => {
      // Le toucher EST la lecture. La requête part tout de suite, sans être
      // attendue avant d'ouvrir : `openWindow` et `focus` ne sont admis que
      // pendant le geste, et une attente réseau le ferait expirer.
      const reading = data.id ? markRead(data.id) : Promise.resolve(null);

      // « Marquer comme lue » ne quitte pas l'écran où l'on se trouve.
      if (event.action !== 'read') await openTarget(internalUrl(data.url));

      const unread = await reading;

      if (unread !== null) {
        await setAppBadge(unread);
        await notifyWindows({ type: 'nk:push', unread });
      }
    })(),
  );
});

/**
 * Marque la notification comme lue et rend ce qui reste non lu.
 *
 * Passe par le relais du site, avec le cookie de session : le navigateur ne
 * connaît qu'une origine. Sans session (déconnecté entre-temps), la requête
 * échoue sans bruit — la notification restera simplement non lue.
 */
async function markRead(id) {
  try {
    const response = await fetch('/api/notifications/lues', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });

    if (!response.ok) return null;

    const body = await response.json();
    return typeof body.unreadCount === 'number' ? body.unreadCount : null;
  } catch {
    return null;
  }
}

/** Ouvre la page visée : dans l'onglet du site déjà ouvert s'il y en a un, sinon dans un nouveau. */
async function openTarget(target) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const client of windows) {
    if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
      try {
        const focused = await client.focus();
        // `navigate` exige un onglet contrôlé par ce worker : sinon on retombe
        // sur l'ouverture d'un nouvel onglet.
        return await focused.navigate(target);
      } catch {
        return self.clients.openWindow(target);
      }
    }
  }

  return self.clients.openWindow(target);
}

/** Dit aux fenêtres ouvertes qu'une notification vient d'arriver. */
async function notifyWindows(message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  for (const client of windows) client.postMessage(message);
}

/**
 * Pastille de l'icône de l'application : le nombre de non lues.
 *
 * Réservée aux applications installées (Android, Windows, macOS, iPhone 16.4+) ;
 * ailleurs l'API n'existe pas, et ne rien faire est la bonne réponse.
 */
async function setAppBadge(count) {
  if (count === null) return;

  try {
    const nav = self.navigator;
    if (!nav) return;

    if (count > 0 && typeof nav.setAppBadge === 'function') {
      await nav.setAppBadge(count);
    } else if (count === 0 && typeof nav.clearAppBadge === 'function') {
      await nav.clearAppBadge();
    }
  } catch {
    // La pastille est un confort : son absence ne doit jamais empêcher d'afficher
    // la notification.
  }
}

/**
 * Le navigateur renouvelle parfois l'abonnement de lui-même — expiration, mise à
 * jour, nettoyage. L'ancienne adresse ne reçoit alors plus rien, et sans cette
 * reprise l'appareil devient muet sans que personne le sache. Si la reprise
 * échoue (session expirée), la page rétablit l'abonnement à sa prochaine ouverture.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(renewSubscription(event));
});

async function renewSubscription(event) {
  try {
    const previous = event.oldSubscription;
    const key = previous && previous.options && previous.options.applicationServerKey;

    const subscription =
      event.newSubscription ||
      (key
        ? await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          })
        : null);

    if (!subscription) return;

    await fetch('/api/me/push/subscriptions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch {
    // Rien à faire ici : la page reprendra la main.
  }
}

/**
 * Chemin interne d'un message, ou la page des alertes s'il n'en propose pas — ou
 * s'il propose autre chose : une adresse externe, un schéma inattendu.
 */
function internalPath(candidate) {
  // Sans adresse, `new URL('', origine)` donnerait la racine du site : une
  // notification qui n'a rien à dire de précis renvoie vers les alertes, où
  // l'on retrouve ce qu'elle annonçait.
  if (typeof candidate !== 'string' || candidate === '') return ALERTS_PATH;

  try {
    const url = new URL(candidate, self.location.origin);
    if (url.origin === self.location.origin) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // Contenu illisible : retomber sur les alertes.
  }

  return ALERTS_PATH;
}

/** Adresse complète d'un chemin interne. */
function internalUrl(candidate) {
  return new URL(internalPath(candidate), self.location.origin).href;
}

/** Une route de billet : `/t/<jeton>` ou `/mon-compte/billets/<id>`. */
function isTicketRoute(pathname) {
  return pathname.startsWith('/t/') || pathname.startsWith('/mon-compte/billets');
}

/**
 * Cache d'abord, revalidation silencieuse.
 *
 * Le billet s'affiche immédiatement, puis se met à jour en arrière-plan si le
 * réseau le permet. Le porteur ne voit jamais d'attente.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Revalidation détachée : on ne l'attend pas.
    void network;
    return cached;
  }

  return (await network) ?? offlineResponse(request);
}

/** Réseau d'abord, cache en secours, avec une limite de pages conservées. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      void cache.put(request, response.clone()).then(() => trimCache(PAGES_CACHE, MAX_PAGES));
    }

    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? offlineResponse(request);
  }
}

/** Garde les N entrées les plus récentes. Les caches non bornés finissent purgés
 *  entièrement par le système, au pire moment. */
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  for (const key of keys.slice(0, Math.max(0, keys.length - max))) {
    await cache.delete(key);
  }
}

/**
 * Réponse hors ligne.
 *
 * Une page lisible plutôt qu'une erreur du navigateur : elle dit ce qui se
 * passe et ce qui reste accessible. « On dégrade la fonctionnalité, on ne coupe
 * pas l'accès. »
 */
function offlineResponse(request) {
  if (request.mode !== 'navigate') {
    return new Response('', { status: 503, statusText: 'Hors ligne' });
  }

  return new Response(
    `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hors ligne · Nexa-Kabi</title>
    <style>
      body {
        margin: 0; min-height: 100dvh; display: grid; place-items: center;
        background: #12102B; color: #fff; text-align: center; padding: 24px;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      }
      h1 { font-size: 24px; margin: 0 0 8px; }
      p { color: rgba(255,255,255,.7); margin: 0 0 24px; max-width: 34ch; line-height: 1.5; }
      a {
        display: inline-block; background: #FF4D2E; color: #12102B; font-weight: 700;
        text-decoration: none; padding: 14px 26px; border-radius: 11px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Pas de connexion</h1>
      <p>Tes billets déjà ouverts restent consultables, QR compris. Le reste reviendra dès que le réseau sera de retour.</p>
      <a href="/mon-compte/billets">Voir mes billets</a>
    </main>
  </body>
</html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
