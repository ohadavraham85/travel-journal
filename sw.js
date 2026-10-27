// Service worker: precaches the app shell, geo data and libraries so the app opens with no connection.
const VERSION = "tj-v2";
const RUNTIME = "tj-runtime-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png",
  "./geo/countries-50m.json", "./geo/num2a2.json", "./geo/places.json"];
const LIBS = [
  "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js",
  "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
];
const RUNTIME_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com", "basemaps.cartocdn.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    await (await caches.open(VERSION)).addAll(SHELL);
    // Libraries are best-effort: a CDN hiccup shouldn't block installing the app.
    const rt = await caches.open(RUNTIME);
    await Promise.all(LIBS.map(u => rt.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App shell: network first (so updates arrive), cache fallback when offline.
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }

  // Libraries, fonts, tiles: cache first, refresh in background.
  if (RUNTIME_HOSTS.some(h => url.hostname === h || url.hostname.endsWith("." + h))) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Everything else (Google APIs, Drive) goes straight to the network.
});
