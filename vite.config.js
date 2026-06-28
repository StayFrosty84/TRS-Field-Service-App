import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// On GitHub Pages a project site is served from /<repo-name>/, so `base` must match.
// The deploy workflow sets VITE_BASE; locally it defaults to "/".
const base = process.env.VITE_BASE || '/';

// Surface the package version to the app so the running build is identifiable (e.g. v3 vs v2).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Field Service v3 — Work Orders & Bills',
        short_name: 'Field Svc v3',
        description:
          'Log field-service work orders and generate signed bills of sale. Works offline.',
        theme_color: '#0f766e',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell so it launches offline after first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
