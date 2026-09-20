/* IELTS Speaking Pro — Service Worker
 * Strategiya:
 *   - Ilova qobig'i va mavzular banki (data.js) oldindan cache'lanadi → Part 1/2/3 internetsiz ishlaydi.
 *   - Mock topshirish / akkaunt / bulutga saqlash — faqat tarmoq (Firebase hech qachon cache'lanmaydi).
 *   - Navigatsiya: avval tarmoq, uzilsa cache'dagi index.html.
 */

const VERSION = 'v1.0.0';
const SHELL_CACHE = `ielts-shell-${VERSION}`;
const RUNTIME_CACHE = `ielts-runtime-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, RUNTIME_CACHE]);

/* Offline uchun majburiy fayllar — biri yuklanmasa o'rnatish bekor qilinadi. */
const CORE_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/data.js',
  './js/app.js',
  './js/pwa.js',
  './vendor/lucide.min.js',
  './assets/fonts/fonts.css',
  './manifest.webmanifest',
  './offline.html',
];

/* Bo'lsa yaxshi, bo'lmasa o'rnatishni to'xtatmaydigan fayllar. */
const OPTIONAL_ASSETS = [
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/icons/logo-128.png',
  './assets/fonts/files/plus-jakarta-sans-latin-400-normal.woff2',
  './assets/fonts/files/plus-jakarta-sans-latin-500-normal.woff2',
  './assets/fonts/files/plus-jakarta-sans-latin-600-normal.woff2',
  './assets/fonts/files/plus-jakarta-sans-latin-700-normal.woff2',
  './assets/fonts/files/plus-jakarta-sans-latin-800-normal.woff2',
  './assets/fonts/files/instrument-serif-latin-400-normal.woff2',
  './assets/fonts/files/instrument-serif-latin-400-italic.woff2',
  './assets/fonts/files/jetbrains-mono-latin-500-normal.woff2',
];

/* Bu manzillar hech qachon cache'lanmaydi — doim jonli tarmoq. */
const NETWORK_ONLY_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'www.googleapis.com',
  'firebaselogging-pa.googleapis.com',
  'firebase.googleapis.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (KEEP.has(n) ? null : caches.delete(n))));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) { /* ignore */ }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION') {
    event.source && event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

const isNetworkOnly = (url) =>
  NETWORK_ONLY_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));

/** Cache'ga yozishga arziydigan javobmi? */
const cacheable = (res) =>
  res && res.status === 200 && (res.type === 'basic' || res.type === 'cors' || res.type === 'default');

/* Navigatsiya: tarmoq birinchi, uzilsa — cache'dagi ilova qobig'i. */
async function handleNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const preload = await event.preloadResponse;
    const network = preload || (await fetch(event.request));
    if (cacheable(network)) cache.put('./index.html', network.clone());
    return network;
  } catch (e) {
    return (
      (await cache.match('./index.html')) ||
      (await cache.match('./')) ||
      (await cache.match('./offline.html')) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    );
  }
}

/* Statik fayl: cache birinchi (tez + offline), orqa fonda jimgina yangilanadi. */
async function handleAsset(event) {
  const { request } = event;
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) {
    event.waitUntil(refreshInBackground(request, cache));
    return hit;
  }
  try {
    const res = await fetch(request);
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function refreshInBackground(request, cache) {
  try {
    const res = await fetch(request);
    if (cacheable(res)) await cache.put(request, res.clone());
  } catch (e) { /* offline — mavjud nusxa qoladi */ }
}

/* Uchinchi tomon (gstatic Firebase SDK va h.k.): tarmoq, uzilsa cache. */
async function handleThirdParty(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (!url.protocol.startsWith('http')) return;

  // Firebase/Firestore — SW umuman aralashmaydi (mock natijalari doim jonli).
  if (isNetworkOnly(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.origin === self.location.origin) {
    // Admin panel cache'lanmaydi — u doim yangi bo'lishi kerak.
    if (url.pathname.includes('admin')) return;
    event.respondWith(handleAsset(event));
    return;
  }

  event.respondWith(handleThirdParty(request));
});
