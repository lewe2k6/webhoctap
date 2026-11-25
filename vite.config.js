import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { localStudyLibrary } from './scripts/local-library.js'

export default defineConfig(({ command }) => {
  const base = process.env.PAGES_BASE || (command === 'build' ? '/webhoctap/' : '/')

  return {
    base,
    server: {
      fs: { deny: ['**/.env', '**/.env.*', '**/*.{crt,pem}', '**/.git/**', '**/.private/**', '**/supabase/**'] },
    },
    plugins: [
      react(),
      localStudyLibrary(),
      viteStaticCopy({
        targets: ['cmaps', 'standard_fonts', 'wasm'].map((directory) => ({
          src: `node_modules/pdfjs-dist/${directory}`,
          dest: 'pdfjs',
        })),
      }),
      VitePWA({
      base,
      scope: base,
      registerType: 'autoUpdate',
      manifest: {
        id: base,
        name: 'Ôn tập Kinh tế TMU',
        short_name: 'Kinh tế TMU',
        description: 'Thư viện và bài luyện cá nhân ngành Kinh tế TMU',
        lang: 'vi',
        start_url: base,
        scope: base,
        display: 'standalone',
        theme_color: '#f7f7f2',
        background_color: '#f7f7f2',
        icons: [
          { src: 'study-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'study-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff,woff2,png,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      }),
    ],
  }
})
