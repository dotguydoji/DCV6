import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          // false, not 'script-defer' - the auto-injected script only ever
          // calls navigator.serviceWorker.register() with no update-detection
          // or reload logic at all, regardless of registerType. That's what
          // let a visitor's browser keep running an old service worker
          // (serving its own cached HTML/JS, referencing asset filenames a
          // newer deploy had already deleted) indefinitely - the browser only
          // swaps in a waiting new worker once every open tab for the site is
          // fully closed, which "left the tab open in the background" never
          // satisfies. src/registerServiceWorker.ts (called from index.tsx)
          // uses the real virtual:pwa-register module instead, which
          // actually activates a new worker immediately and reloads the page
          // once it takes over.
          injectRegister: false,
          manifest: {
            name: "Doji's Library",
            short_name: "Doji's Library",
            description: "Doji's Library by Doji Creates, a tech influencer in the Philippines creating tutorials about AI, programming, coding, robotics, and technology.",
            start_url: '/',
            scope: '/',
            display: 'standalone',
            theme_color: '#1e2122',
            background_color: '#1e2122',
            icons: [
              { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
              { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
            ]
          },
          workbox: {
            // Without these, a new worker only ever reaches "waiting" -
            // skipWaiting still needs a client to post it the SKIP_WAITING
            // message (registerServiceWorker.ts does that), but even once
            // activated, clientsClaim is what makes it take over tabs that
            // are ALREADY open (not just future navigations). Without it, an
            // already-open tab's controllerchange listener has nothing to
            // fire on, so a tab that's just sitting there never self-updates
            // - only a fresh navigation would. Both are needed together for
            // an open-but-idle tab to actually recover on its own.
            skipWaiting: true,
            clientsClaim: true,
            globPatterns: ['**/*.{html,ico,svg,webmanifest}', 'assets/index-*.{js,css}', 'assets/vendor-*.js'],
            globIgnores: ['**/pdf-viewer-lib-*', '**/PdfGatePage-*', '**/MyLibraryPage-*', '**/cart-modal-*', '**/faq-section-*'],
            navigateFallbackDenylist: [/^\/\.netlify\/functions\//, /^\/view\//, /^\/my-library/],
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
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/pdfjs-dist')) {
                return 'pdf-viewer-lib';
              }
              if (id.includes('node_modules')) {
                return 'vendor';
              }
              if (id.includes('/components/CartModal')) {
                return 'cart-modal';
              }
              if (id.includes('/components/FAQSection')) {
                return 'faq-section';
              }
            }
          }
        }
      }
    };
});
