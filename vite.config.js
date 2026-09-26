import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'] },
      manifest: {
        name: 'Rambo Zambo Kegelverein',
        short_name: 'RZK',
        description: 'Termine, Chat, Abstimmungen, Kasse und Fotos des Rambo Zambo Kegelvereins',
        lang: 'de',
        start_url: '/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#3E4A61',
        icons: [
          { src: '/icons/rzk-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/rzk-icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/rzk-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
