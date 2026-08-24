import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Palheiros Midas',
        short_name: 'Palheiros',
        description: 'Gestão de produção Palheiros Midas',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0D1018',
        background_color: '#0D1018',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Leituras do banco. Sem isso, o app abre offline mas com todas as
            // telas vazias — o parceiro no galpão sem sinal não vê nem o que já
            // produziu na quinzena. A rede continua vindo primeiro: o cache só
            // entra quando ela falha ou demora demais, então o número mostrado
            // é o mais novo que existir, e o app avisa no topo quando está sem
            // conexão — dado velho sem aviso é pior do que tela vazia.
            // Só GET passa por aqui; gravação é POST e nunca é cacheada.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /\.supabase\.co$/.test(url.hostname) && url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dados-supabase',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})
