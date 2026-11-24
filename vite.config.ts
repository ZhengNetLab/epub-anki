import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { PROVIDERS } from './src/providers.ts'

/**
 * Content-Security-Policy, injected as a <meta> tag (GitHub Pages can't set headers).
 *
 * Book pages are rendered by foliate-js in same-origin iframes loaded from blob: URLs, so
 * a script inside an EPUB could otherwise read localStorage (where the user's API key
 * lives) — foliate-js's README says a CSP is mandatory. blob: documents inherit this
 * policy, which blocks every book script (inline, event handlers, data:, SVG) while still
 * allowing the book's own blob:/data: styles, images and fonts.
 * Network access is limited to this site and the AI providers' API hosts.
 */
function csp(): Plugin {
  const apis = Object.values(PROVIDERS).map((p) => new URL(p.baseUrl).origin)
  const policy = (dev: boolean) => [
    "default-src 'self'",
    "script-src 'self'",
    // Books and our own injected CSS use inline styles and blob: stylesheets.
    "style-src 'self' 'unsafe-inline' blob: data:",
    "img-src 'self' blob: data:",
    "font-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "frame-src 'self' blob:",
    "worker-src 'self'",
    // Dev only: Vite's live-reload websocket.
    `connect-src 'self' blob: data: ${apis.join(' ')}${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
  let dev = false
  return {
    name: 'csp-meta',
    configResolved(c) {
      dev = c.command === 'serve'
    },
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy(dev) },
        injectTo: 'head-prepend',
      }],
    },
  }
}

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH || '/',
  plugins: [
    csp(),
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
