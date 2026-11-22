// Measure lookup latency per model with the real prompt.
// Usage: node scripts/bench-lookup.ts [provider:model ...] [--runs N]
//   e.g. node scripts/bench-lookup.ts openai:gpt-6-luna openai:gpt-6.1-terra deepseek:deepseek-flash
// Reads keys from .env. Each run is one real (billed, tiny) API call.

import { lookup } from '../server/lookup.ts'
import { resolveConfig, type ProviderName } from '../server/providers.ts'

try { process.loadEnvFile('.env') } catch { /* no .env */ }

const args = process.argv.slice(2)
const runsIdx = args.indexOf('--runs')
const runs = runsIdx >= 0 ? Number(args.splice(runsIdx, 2)[1]) || 3 : 3
const targets = args.length ? args : ['openai:gpt-6-luna', 'openai:gpt-6.1-terra']

const samples = [
  { word: 'candour', sentence: 'She introduced herself as Wren and declared, with remarkable candour, that she had run away from a very dull school.', lang: 'en' },
  { word: 'shingle', sentence: 'When the boat finally scraped onto the shingle, a girl climbed out, soaked, defiant, and utterly unapologetic.', lang: 'en' },
  { word: 'entertained', sentence: 'The keeper, who had not entertained a visitor in eleven years, found himself serving tea in his only unchipped cup.', lang: 'en' },
]

for (const target of targets) {
  const [provider, model] = target.split(':') as [ProviderName, string | undefined]
  const cfg = resolveConfig(process.env, { provider, model })
  if (!cfg.apiKey) {
    console.log(`${target}: skipped (no ${cfg.keyVar} in .env)`)
    continue
  }
  const times: number[] = []
  let last = ''
  for (let i = 0; i < runs; i++) {
    const s = samples[i % samples.length]
    const t0 = performance.now()
    try {
      const r = await lookup(s, cfg)
      times.push(performance.now() - t0)
      last = `${s.word} → ${r.meaning}`
    } catch (e) {
      console.log(`${target}: error: ${e instanceof Error ? e.message : e}`)
      break
    }
  }
  if (!times.length) continue
  const sorted = [...times].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  console.log(`${target}: median ${(median / 1000).toFixed(2)}s  (runs: ${times.map((t) => (t / 1000).toFixed(2)).join(', ')})  e.g. ${last}`)
}
