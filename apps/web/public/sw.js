/* Production Phase 9 — NazdikStore service worker
 * Cache-first: static, fonts, icons, map shell
 * Network-first: API orders/wallet/chat
 * Offline fallback page
 */
const CACHE = 'nazdik-prod-v2';
const STATIC = [
  '/',
  '/map',
  '/auth',
  '/feed',
  '/tour',
  '/manifest.webmanifest',
  '/icon.svg',
  '/offline',
];

const API_PREFIX = '/api/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isNetworkFirst(url) {
  return url.pathname.includes(API_PREFIX) || url.pathname.startsWith('/orders') || url.pathname.startsWith('/messages');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !url.hostname.includes('jsdelivr') && !url.hostname.includes('tile.')) {
    // allow font CDN + tiles through cache-or-network
  }

  if (isNetworkFirst(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || offlineResponse())),
    );
    return;
  }

  // cache-first for app shell / fonts / icons
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('/offline');
          return offlineResponse();
        });
    }),
  );
});

function offlineResponse() {
  return new Response(
    '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>آفلاین</title><body style="font-family:Tahoma;background:#F7F4EF;color:#1C2421;display:grid;place-items:center;min-height:100vh;margin:0"><div style="text-align:center;padding:24px"><h1 style="color:#0F6B5C">آفلاین هستید</h1><p>اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.</p><button onclick="location.reload()" style="background:#0F6B5C;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-family:inherit;font-weight:700;cursor:pointer">تلاش مجدد</button></div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
