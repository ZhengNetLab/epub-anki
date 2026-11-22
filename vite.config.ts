import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH || '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'EPUB 阅读器 · AI 查词制卡',
        short_name: 'EPUB查词',
        description: '读 EPUB，选词用 AI 查释义，一键做成 Anki 卡片',
        lang: 'zh-CN',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fbfaf7',
        theme_color: '#2f6fdb',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app (including foliate-js's lazily loaded chunks) so it opens offline.
        // AI API calls go to other origins and are never cached.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
    }),
  ],
  // foliate-js loads its format modules and vendored zip lib via dynamic import;
  // keep it out of dependency pre-bundling so those relative imports resolve.
  optimizeDeps: { exclude: ['foliate-js'] },
})
