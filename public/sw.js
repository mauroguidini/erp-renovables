// Service worker mínimo — su único propósito es que el navegador considere
// la app "instalable". A propósito NO cachea páginas, datos ni llamadas a
// Supabase: solo un puñado de assets estáticos que nunca cambian de
// contenido. Cualquier otro pedido pasa derecho a la red, sin tocarlo, para
// no arriesgarse a mostrar información vieja mientras el sistema sigue en
// desarrollo activo.
const CACHE_NAME = "erp-renovables-static-v1";
const ASSETS_A_CACHEAR = ["/icon-192.png", "/icon-512.png", "/logo-bsi.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_A_CACHEAR))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres.filter((nombre) => nombre !== CACHE_NAME).map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (!ASSETS_A_CACHEAR.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cacheada) => cacheada || fetch(event.request))
  );
});
