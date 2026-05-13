import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8085";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg"],
        manifest: {
          name: "Theatrico",
          short_name: "Theatrico",
          description: "Live theater script companion for audience devices.",
          theme_color: "#130f13",
          background_color: "#130f13",
          display: "standalone",
          orientation: "portrait",
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "/icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": new URL("./src", import.meta.url).pathname,
        "@theatrico/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
      },
    },
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
