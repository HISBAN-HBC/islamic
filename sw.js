// HISBAN Islamic model offline cache: network first, cached copy when there is no network
const CACHE = "hisban-islamic-1.0";
const FILES = ["./", "./index.html", "./hisban-core.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("hisban-islamic") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
