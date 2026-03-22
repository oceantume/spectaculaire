import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    preact({
      prerender: {
        enabled: true,
        renderTarget: "#app",
        additionalPrerenderRoutes: ["/envolet2026"],
      },
    }),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.mode === "navigate" ||
              request.destination === "script" ||
              request.destination === "style" ||
              request.destination === "image",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "spectaculaire-runtime",
            },
          },
        ],
      },
      manifest: {
        name: "Spectaculaire",
        description: "Horaire de la programmation du Festival d'été de Québec 2026",
        lang: "fr",
        start_url: "/feq2026",
        display: "standalone",
        background_color: "#111827",
        theme_color: "#111827",
        icons: [
          { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icons/512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
