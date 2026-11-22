import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createLookupHandler } from './server/lookup.ts'

/** Serves POST /api/lookup from the Vite process (dev and preview), keeping the key server-side. */
function lookupApi(env: Record<string, string>): Plugin {
  const handler = createLookupHandler({
    apiKey: env.DEEPSEEK_API_KEY?.trim(),
    model: env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash',
    baseUrl: env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com',
  })
  return {
    name: 'lookup-api',
    configureServer(server) {
      server.middlewares.use('/api/lookup', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/lookup', handler)
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' prefix loads all .env vars into this Node process only; nothing here is
  // exposed to client code (only VITE_-prefixed vars would be).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [lookupApi(env)],
    // foliate-js loads its format modules and vendored zip lib via dynamic import;
    // keep it out of dependency pre-bundling so those relative imports resolve.
    optimizeDeps: { exclude: ['foliate-js'] },
  }
})
