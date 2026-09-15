/**
 * Service worker du scanner.
 *
 * ── Périmètre volontairement étroit ─────────────────────────────────────────
 * Il ne met en cache QUE la coque du scanner. Le prototype est catégorique sur
 * ce point : « un cache trop large sur un Android d'entrée de gamme se traduit
 * par une application désinstallée ». Ni images d'événements, ni pages
 * publiques, ni polices supplémentaires.
 *
 * Le carnet et la file de scans ne passent PAS par ici : ils vivent dans
 * IndexedDB, qui sait les interroger et les modifier. Un cache HTTP ne saurait
 * qu'en restituer des copies figées.
 *
 * ── Stratégies ──────────────────────────────────────────────────────────────
 *  · Navigation vers /scan  → cache d'abord, réseau en arrière-plan. Le scanner
 *    doit s'ouvrir en mode avion, immédiatement.
 *  · Ressources /_next/static → cache d'abord ; leur nom contient une empreinte,
 *    elles ne changent jamais sous un même nom.
 *  · Appels /api            → réseau uniquement. Servir un carnet périmé depuis
 *    un cache HTTP serait pire que ne rien servir : le contrôleur croirait
 *    travailler à jour.
 */

const CACHE = 'nexakabi-scanner-v1';

/** Coque minimale, mise en cache à l'installation. */
const SHELL = ['/scan'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // Une coque incomplète ne doit pas empêcher l'installation : le réseau
      // prendra le relais, et la prochaine visite complétera le cache.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Autre origine, ou API : jamais de cache.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Hors du scanner : ce service worker ne s'en mêle pas.
  if (!url.pathname.startsWith('/scan')) return;

  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  }
});

/**
 * Réponse immédiate depuis le cache, rafraîchie en arrière-plan.
 *
 * Le contrôleur ouvre son scanner sans attendre le réseau ; la version suivante
 * sera à jour. C'est le bon compromis pour une coque qui change rarement.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    void network;
    return cached;
  }

  const response = await network;

  return (
    response ??
    new Response(
      '<!doctype html><meta charset="utf-8"><p style="font:16px system-ui;padding:24px">Scanner indisponible hors ligne. Ouvre-le une fois avec du réseau.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());

  return response;
}
