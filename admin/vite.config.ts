import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 3001,
    host: '0.0.0.0'
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: {
        name: 'DC Notes — Admin',
        short_name: 'DC Notes Admin',
        description: 'Owner-only admin panel for managing Doji\'s Library buyer access and PDF files.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#15171a',
        background_color: '#15171a',
        icons: [
          { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        // Precache only the built static app shell (JS/CSS/HTML/icons).
        // Every Netlify Function call in this app is a POST carrying a
        // fresh idToken that must be verified server-side on every single
        // request - none of that traffic may ever be served from a cache,
        // so it's explicitly excluded (NetworkOnly) rather than relying on
        // Workbox's default GET-only caching behavior.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallbackDenylist: [/^\/\.netlify\/functions\//],
        runtimeCaching: [
          {
            urlPattern: /^\/\.netlify\/functions\/.*/,
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
