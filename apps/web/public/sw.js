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
// Le serveur envoie `{ title, body, url, tag }`, chiffré de bout en bout : seul
// ce navigateur peut le lire. La notification s'affiche même application
// fermée ; la toucher ouvre `url` — toujours un chemin de CE site, jamais une
// adresse extérieure, même si le contenu le prétendait.

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Nexa-Kabi';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === 'string' ? payload.body : '',
      icon: '/icon/192',
      badge: '/icon/192',
      lang: 'fr',
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      data: { url: typeof payload.url === 'string' ? payload.url : '/mon-compte/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = internalUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Un onglet du site déjà ouvert : on s'y rend plutôt que d'en ouvrir un de plus.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          // `navigate` exige un onglet contrôlé par ce worker : sinon, on ouvre
          // simplement la page dans un nouvel onglet.
          return client
            .focus()
            .then((focused) => focused.navigate(target))
            .catch(() => self.clients.openWindow(target));
        }
      }

      return self.clients.openWindow(target);
    }),
  );
});

/** Chemin interne, ou la page des alertes si le contenu reçu propose autre chose. */
function internalUrl(candidate) {
  try {
    const url = new URL(typeof candidate === 'string' ? candidate : '/', self.location.origin);
    if (url.origin === self.location.origin) return url.href;
  } catch {
    // Contenu illisible : retomber sur les alertes.
  }

  return new URL('/mon-compte/notifications', self.location.origin).href;
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
