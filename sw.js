/* KAKU Service Worker — オフライン対応とキャッシュ管理
 * アプリを更新したら VERSION の数字を上げてください（古いキャッシュが自動で消えます）。 */
const VERSION = "2026-11-08.8";
const CACHE = "kaku-estimate-" + VERSION;

/* 最初に必ず保存するもの（これが揃えばオフラインで起動できる） */
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/pdfjs/pdf.min.mjs",
  "./vendor/pdfjs/pdf.worker.min.mjs"
];

/* PDF図面の日本語文字の読み込み用。インストール時にまとめて保存（失敗しても起動には影響しない） */
const EXTRA = [
  "./vendor/pdfjs/cmaps/78-EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/78-EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/78-H.bcmap",
  "./vendor/pdfjs/cmaps/78-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/78-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/78-V.bcmap",
  "./vendor/pdfjs/cmaps/78ms-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/78ms-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/83pv-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90ms-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90ms-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/90msp-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90msp-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/90pv-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/90pv-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Add-H.bcmap",
  "./vendor/pdfjs/cmaps/Add-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/Add-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Add-V.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-0.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-1.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-2.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-3.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-4.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-5.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-6.bcmap",
  "./vendor/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap",
  "./vendor/pdfjs/cmaps/EUC-H.bcmap",
  "./vendor/pdfjs/cmaps/EUC-V.bcmap",
  "./vendor/pdfjs/cmaps/Ext-H.bcmap",
  "./vendor/pdfjs/cmaps/Ext-RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/Ext-RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Ext-V.bcmap",
  "./vendor/pdfjs/cmaps/H.bcmap",
  "./vendor/pdfjs/cmaps/Hankaku.bcmap",
  "./vendor/pdfjs/cmaps/Hiragana.bcmap",
  "./vendor/pdfjs/cmaps/Katakana.bcmap",
  "./vendor/pdfjs/cmaps/NWP-H.bcmap",
  "./vendor/pdfjs/cmaps/NWP-V.bcmap",
  "./vendor/pdfjs/cmaps/RKSJ-H.bcmap",
  "./vendor/pdfjs/cmaps/RKSJ-V.bcmap",
  "./vendor/pdfjs/cmaps/Roman.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap",
  "./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap",
  "./vendor/pdfjs/cmaps/V.bcmap",
  "./vendor/pdfjs/cmaps/WP-Symbol.bcmap"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map((u) => new Request(u, { cache: "reload" })));
    await Promise.allSettled(EXTRA.map((u) => cache.add(new Request(u, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("kaku-estimate-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部へのリクエストには触らない
  if (url.pathname.includes("/suido/")) return; // 水道概算（別のアプリ）には触らない

  // 画面（index.html）はネット優先：つながる時は最新版、つながらない時は保存版
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: "no-store" });
        if (res && res.ok) cache.put("./index.html", res.clone());
        return res;
      } catch (e) {
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // それ以外（アイコン・pdf.jsなど）は保存版優先、なければ取りに行って保存
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});
