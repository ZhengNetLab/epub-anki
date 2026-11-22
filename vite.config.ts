import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createLookupHandler } from './server/lookup.ts'
import { resolveConfig } from './server/providers.ts'

/** Serves POST /api/lookup from the Vite process (dev and preview), keeping the key server-side. */
function lookupApi(env: Record<string, string>): Plugin {
  const cfg = resolveConfig(env)
  const handler = createLookupHandler(cfg)
  return {
    name: 'lookup-api',
    configureServer(server) {
      server.config.logger.info(`  AI lookup: ${cfg.provider} / ${cfg.model}${cfg.apiKey ? '' : ` (missing ${cfg.keyVar})`}`)
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
