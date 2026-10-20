// Removes itself (2026-10-20).
//
// The site had offline support for one day (2026-06-10) and a browser that
// visited then may still hold that service worker, with stale copies of old
// files. Since then /sw.js redirected to /login, so those browsers could never
// update it and kept it for good. This version is what they now fetch: it
// clears every cache the old one made and unregisters. It does not reload
// open pages, so nobody loses work; the next visit is plain network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
    })(),
  );
});
