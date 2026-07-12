/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

export {};
declare const self: ServiceWorkerGlobalScope;

/**
 * TEMPORARY, one-time sweep for visitors stuck on a pre-clientsClaim
 * service worker (installed before commit 336e597) - that worker never
 * checks in with the page, so no ordinary code fix can reach it. This
 * replaces it, unregisters itself, wipes every cache this origin owns, and
 * forces any open tab back to a real network request - landing them on the
 * current (already-fixed) build, which re-registers cleanly from there.
 *
 * vite-plugin-pwa's injectManifest strategy requires self.__WB_MANIFEST to
 * be consumed somewhere in the source - injectManifest.globPatterns is []
 * (vite.config.ts), so this precaches nothing; it's here purely to satisfy
 * the build tooling, not because this worker caches anything.
 */
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      await self.registration.unregister();

      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
