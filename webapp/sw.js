/* Service worker : la liseuse fonctionne hors connexion après la première visite. */
const CACHE = "liseuse-v1.1.0";
const ASSETS = [
  "./",
  "css/app.css",
  "css/fonts.css",
  "exemples/fables-de-la-fontaine.epub",
  "fonts/atkinson-hyperlegible-latin-400-normal.woff2",
  "fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "fonts/lexend-latin-400-normal.woff2",
  "fonts/lexend-latin-700-normal.woff2",
  "fonts/opendyslexic-latin-400-italic.woff2",
  "fonts/opendyslexic-latin-400-normal.woff2",
  "fonts/opendyslexic-latin-700-normal.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "js/app.js",
  "js/catalogue.js",
  "js/settings.js",
  "js/storage.js",
  "js/tts.js",
  "manifest.webmanifest",
  "vendor/epub.min.js",
  "vendor/jszip.min.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // Cache d'abord (hors ligne), mise à jour en arrière-plan pour la visite suivante
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
