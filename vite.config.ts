import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      // The manifest is written by hand (public/manifest.json, linked in
      // index.html): the plugin only builds the Service Worker.
      manifest: false,
      // We write the Service Worker ourselves (src/sw.ts); the plugin only
      // injects the precache list into it after the build, with the real
      // hashed file names.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false, // main.ts registers it with virtual:pwa-register
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,png,json}"],
        // Model sheets are cached on demand (see sw.ts), not precached.
        globIgnores: ["modelos/**"],
      },
    }),
  ],
});
