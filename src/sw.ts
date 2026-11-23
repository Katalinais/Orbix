/// <reference lib="webworker" />
// sw.ts — our own Service Worker (injectManifest): vite-plugin-pwa fills in the
// precache list at build time, the routing rules below are ours.
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

// App base path: "/" locally, "/repo-name/" on GitHub Pages.
const BASE = import.meta.env.BASE_URL;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.pathname.startsWith(BASE + "iconos/"),
  new CacheFirst({
    cacheName: "imagenes",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

// Long-form model sheets: cached the first time they are read or downloaded.
registerRoute(
  ({ url }) => url.pathname.startsWith(BASE + "modelos/"),
  new CacheFirst({ cacheName: "modelos-3d" })
);
