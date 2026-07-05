import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
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
          injectRegister: 'script-defer',
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
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
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
