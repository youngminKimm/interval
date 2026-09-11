// 네트워크 우선 + 캐시 폴백: 온라인이면 항상 최신 버전, 오프라인이면 캐시로 동작
const CACHE = "interval-v1";
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((r) => r || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))
      )
  );
});
