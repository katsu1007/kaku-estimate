/* 水道概算 ウェブ版：ネットがなくても開けるように保存する。更新したら VERSION を上げる */
const VERSION = "2026-11-09.2";
const CACHE = "suido-" + VERSION;
const FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => { const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith("suido-") && k !== CACHE).map((k) => caches.delete(k))); await self.clients.claim(); })()); });
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try { const res = await fetch(req, { cache: "no-store" }); if (res && res.ok && res.type === "basic") cache.put(req, res.clone()); return res; }
    catch (err) { return (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await cache.match("./index.html") : null) || Response.error(); }
  })());
});
