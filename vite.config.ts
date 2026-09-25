import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this project from a /<repo>/ subpath. Locally and on
// other static hosts (Vercel, Netlify, …) the app is served from the root.
const base = process.env.GITHUB_PAGES ? '/KostenblickRepo/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        id: '.',
        name: 'Kostenblick',
        short_name: 'Kostenblick',
        description:
          'Persönliche Übersicht für Nebenkosten, Verträge und Haushaltskosten.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0a84ff',
        lang: 'de',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The local OCR engine (Tesseract worker/WASM, German trained data,
        // the code-split LocalOCRService chunk) and the PDF.js worker chunk
        // are multi-MB and only needed once a user actually imports a
        // document - they are cached on first use via runtimeCaching below
        // instead of bloating the initial install for every other screen.
        globIgnores: ['vendor/**', 'tessdata/**', '**/LocalOCRService-*.js'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/vendor/tesseract/') || url.pathname.includes('/tessdata/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-engine-assets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('pdf.worker') || url.pathname.includes('LocalOCRService'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-worker-assets',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
