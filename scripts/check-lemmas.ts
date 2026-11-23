// Regression check for the lemma (card front) the AI returns, incl. German separable
// verbs and English phrasal verbs. Usage: node scripts/check-lemmas.ts [provider:model]
// Reads keys from .env; each case is one real (billed, tiny) API call.

import { lookup } from '../src/ai.ts'
import { PROVIDERS, type ProviderName } from '../src/providers.ts'

try { process.loadEnvFile('.env') } catch { /* no .env */ }
const [provider = 'openai', model] = (process.argv[2] ?? 'openai').split(':') as [ProviderName, string?]
const apiKey = process.env[provider === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY']?.trim()
if (!apiKey) throw new Error(`No API key for ${provider} in .env`)
const cfg = { provider, apiKey, model: model || PROVIDERS[provider].defaultModel }

const cases: Array<[word: string, sentence: string, lang: string, expected: string]> = [
  ['sieht', 'Er sieht heute sehr müde aus.', 'de', 'aussehen'],
  ['siehst', 'Du siehst in diesem Kleid wunderbar aus!', 'de', 'aussehen'],
  ['rief', 'Sie rief ihre Mutter gestern Abend an.', 'de', 'anrufen'],
  ['stand', 'Am nächsten Morgen stand sie sehr früh auf, weil der Zug um sechs abfuhr.', 'de', 'aufstehen'],
  ['kamen', 'Wir kamen erst spät in der Nacht in Berlin an.', 'de', 'ankommen'],
  ['aussieht', 'Wenn er so müde aussieht, sollte er schlafen.', 'de', 'aussehen'],
  ['sieht', 'Er sieht den Hund im Garten.', 'de', 'sehen'],
  ['Häuser', 'Die Häuser in dieser Straße sind sehr alt.', 'de', 'Haus'],
  ['gave', 'She finally gave the habit up after ten years.', 'en', 'give up'],
  ['looked', 'She looked the word up in the dictionary.', 'en', 'look up'],
  ['ran', 'He ran to the station.', 'en', 'run'],
  ['children', 'The children were playing outside.', 'en', 'child'],
]

let failed = 0
for (const [word, sentence, lang, expected] of cases) {
  const r = await lookup({ word, sentence, lang }, cfg)
  const ok = r.lemma.trim().toLowerCase() === expected.toLowerCase()
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${word.padEnd(9)} → ${r.lemma.padEnd(10)} (expected ${expected})  ${sentence}`)
}
console.log(`\n${cases.length - failed}/${cases.length} passed with ${cfg.provider}:${cfg.model}`)
process.exitCode = failed ? 1 : 0
