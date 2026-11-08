/*
 * Service Worker de Tempo
 *  - Precarrega la closca de l'aplicació (rutes principals) per funcionar sense connexió.
 *  - Recursos estàtics de Next (/_next/static, amb hash): cache primer.
 *  - Navegacions: xarxa primer amb alternativa a la cache.
 *  - API i Supabase: mai es guarden a la cache (les dades viuen a IndexedDB).
 *  - Notificacions push i clics.
 */
const VERSION = "tempo-v1";
const SHELL = ["/today", "/calendar", "/tasks", "/settings", "/login", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: "same-origin" });
            if (res.ok) await cache.put(url, res.clone());
            // Precarrega també els recursos estàtics de cada pàgina
            if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
              const html = await res.text();
              const assets = Array.from(html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)).map((m) => m[1]);
              await Promise.all(assets.map((a) => cache.add(a).catch(() => {})));
            }
          } catch (_) {}
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Google… sempre a la xarxa
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        try {
          const res = await fetch(req);
          if (res.ok && res.type === "basic") cache.put(url.pathname, res.clone());
          return res;
        } catch (_) {
          return (await cache.match(url.pathname)) || (await cache.match("/today")) || new Response("Sense connexió", { status: 503 });
        }
      })(),
    );
    return;
  }

  // Altres recursos del mateix origen (RSC, imatges…): xarxa amb alternativa a la cache
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic" && !url.search.includes("_rsc")) cache.put(req, res.clone());
        return res;
      } catch (_) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw _;
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Tempo", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Tempo", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: { url: data.url || "/today" },
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          c.postMessage({ type: "navigate", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
