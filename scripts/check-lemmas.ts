// Regression check for the lemma (card front) the AI returns, incl. German separable
// verbs and English phrasal verbs, articles on German nouns, and irregular verb forms.
// Usage: node scripts/check-lemmas.ts [provider:model]
// Reads keys from .env; each case is one real (billed, tiny) API call.

import { lookup } from '../src/ai.ts'
import type { LookupResult } from '../src/lookup-types.ts'
import { PROVIDERS, type ProviderName } from '../src/providers.ts'

try { process.loadEnvFile('.env') } catch { /* no .env */ }
const [provider = 'openai', model] = (process.argv[2] ?? 'openai').split(':') as [ProviderName, string?]
const apiKey = process.env[provider === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY']?.trim()
if (!apiKey) throw new Error(`No API key for ${provider} in .env`)
const cfg = { provider, apiKey, model: model || PROVIDERS[provider].defaultModel }

/** Expected verb forms: null = must have none (regular verb / not a verb); otherwise each
 *  listed part must contain these substrings, and an empty list means that part must be empty. */
type Forms = null | { present?: string[]; past?: string[]; perfect?: string[] }
const cases: Array<[word: string, sentence: string, lang: string, expected: string, forms?: Forms]> = [
  ['sieht', 'Er sieht heute sehr müde aus.', 'de', 'aussehen', { present: ['siehst aus', 'sieht aus'], past: ['sah aus', 'sahst aus'], perfect: ['ausgesehen'] }],
  ['siehst', 'Du siehst in diesem Kleid wunderbar aus!', 'de', 'aussehen'],
  ['rief', 'Sie rief ihre Mutter gestern Abend an.', 'de', 'anrufen', { present: [], past: ['rief an'], perfect: ['hat angerufen'] }],
  ['stand', 'Am nächsten Morgen stand sie sehr früh auf, weil der Zug um sechs abfuhr.', 'de', 'aufstehen', { present: [], past: ['stand auf'], perfect: ['ist aufgestanden'] }],
  ['kamen', 'Wir kamen erst spät in der Nacht in Berlin an.', 'de', 'ankommen', { present: [], past: ['kam an'], perfect: ['ist angekommen'] }],
  ['aussieht', 'Wenn er so müde aussieht, sollte er schlafen.', 'de', 'aussehen'],
  ['sieht', 'Er sieht den Hund im Garten.', 'de', 'sehen', { present: ['siehst', 'sieht'], past: ['sah'], perfect: ['hat gesehen'] }],
  ['Häuser', 'Die Häuser in dieser Straße sind sehr alt.', 'de', 'das Haus', null],
  ['Frau', 'Die Frau wartete lange auf den Bus.', 'de', 'die Frau', null],
  ['Tisch', 'Er legte das Buch auf den Tisch.', 'de', 'der Tisch', null],
  ['Leute', 'Viele Leute standen vor dem Kino.', 'de', 'die Leute', null],
  ['wartete', 'Die Frau wartete lange auf den Bus.', 'de', 'warten', null],
  ['machte', 'Sie machte ihre Hausaufgaben am Abend.', 'de', 'machen', null],
  ['ist', 'Das Wetter ist heute schön.', 'de', 'sein', { present: ['bin', 'bist', 'ist', 'sind', 'seid'], past: ['war'], perfect: ['ist gewesen'] }],
  ['brachte', 'Er brachte ihr Blumen mit.', 'de', 'mitbringen', { present: [], past: ['brachte mit'], perfect: ['mitgebracht'] }],
  ['gave', 'She finally gave the habit up after ten years.', 'en', 'give up', { past: ['gave up'], perfect: ['given up'] }],
  ['looked', 'She looked the word up in the dictionary.', 'en', 'look up', null],
  ['ran', 'He ran to the station.', 'en', 'run', { past: ['ran'], perfect: ['run'] }],
  ['children', 'The children were playing outside.', 'en', 'child', null],
]

const formsProblem = (got: LookupResult['forms'], want: Forms | undefined): string => {
  if (want === undefined) return ''
  if (want === null) return got ? `expected no forms, got ${JSON.stringify(got)}` : ''
  if (!got) return 'expected forms, got none'
  for (const part of ['present', 'past', 'perfect'] as const) {
    const need = want[part]
    if (!need) continue
    if (!need.length && got[part]) return `${part} should be empty, got "${got[part]}"`
    const miss = need.find((n) => !got[part].includes(n))
    if (miss) return `${part} "${got[part]}" lacks "${miss}"`
  }
  return ''
}

let failed = 0
for (const [word, sentence, lang, expected, forms] of cases) {
  const r = await lookup({ word, sentence, lang }, cfg)
  const problem = r.lemma.trim().toLowerCase() !== expected.toLowerCase()
    ? `lemma ${r.lemma} (expected ${expected})` : formsProblem(r.forms, forms)
  if (problem) failed++
  const shown = r.forms ? Object.values(r.forms).filter(Boolean).join(' | ') : '—'
  console.log(`${problem ? 'FAIL' : 'PASS'}  ${word.padEnd(9)} → ${r.lemma.padEnd(11)} ${shown}${problem ? `
      ${problem}` : ''}`)
}
console.log(`
${cases.length - failed}/${cases.length} passed with ${cfg.provider}:${cfg.model}`)
process.exitCode = failed ? 1 : 0
