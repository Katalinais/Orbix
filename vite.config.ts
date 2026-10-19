import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      // El manifest ya existe a mano desde la Sesión 27 (public/manifest.json,
      // enlazado en index.html) — aquí solo se pide a Workbox que genere el
      // Service Worker, no que gestione el manifest.
      manifest: false,
      registerType: "autoUpdate",
      injectRegister: false, // registramos nosotros mismos en main.ts, con virtual:pwa-register
      workbox: {
        // Esto es lo que resuelve la limitación de la Sesión 29/32: la lista
        // de precaché se genera a partir de dist/ DESPUÉS del build, con los
        // nombres de archivo reales (con hash incluido) — nunca escrita a mano.
        globPatterns: ["**/*.{html,js,css,png,json}"],
        runtimeCaching: [
          {
            urlPattern: /\/iconos\//,
            handler: "CacheFirst",
            options: {
              cacheName: "imagenes",
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\//,
            handler: "NetworkFirst",
            options: { cacheName: "api-atlas3d" },
          },
        ],
      },
    }),
  ],
});
