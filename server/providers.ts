// AI provider settings for the lookup. Both providers speak the OpenAI-compatible
// Chat Completions API; they differ in base URL, default model and a few body params.

export type ProviderName = 'openai' | 'deepseek'

export interface LookupConfig {
  provider: ProviderName
  apiKey?: string
  /** Name of the env var holding the key, for error messages. */
  keyVar: string
  model: string
  baseUrl: string
  /** Provider-specific request body fields (token limit, reasoning effort). */
  extraBody: Record<string, unknown>
}

type Env = Record<string, string | undefined>

const get = (env: Env, name: string) => env[name]?.trim() || undefined

/**
 * Pick the provider from env:
 * - AI_PROVIDER=openai|deepseek if set;
 * - otherwise OpenAI when OPENAI_API_KEY is present, else DeepSeek.
 */
export function resolveConfig(env: Env, override?: Partial<Pick<LookupConfig, 'provider' | 'model'>>): LookupConfig {
  const explicit = get(env, 'AI_PROVIDER')?.toLowerCase()
  const provider: ProviderName = override?.provider
    ?? (explicit === 'openai' || explicit === 'deepseek' ? explicit
      : get(env, 'OPENAI_API_KEY') ? 'openai' : 'deepseek')

  if (provider === 'openai') {
    // Fastest in our benchmark (2026-11-22, scripts/bench-lookup.ts): gpt-4.1-mini ~1.3s median,
    // vs gpt-5.6-luna ~1.6s, gpt-5.4-nano ~1.65s, gpt-6-luna ~1.8s, with similar answer quality.
    const model = override?.model ?? get(env, 'OPENAI_MODEL') ?? 'gpt-4.1-mini'
    // gpt-4* models are non-reasoning and reject the reasoning_effort parameter.
    const reasoning = /^gpt-4/.test(model) ? {}
      // "none" skips reasoning tokens entirely: lowest latency for a short dictionary answer.
      : { reasoning_effort: get(env, 'OPENAI_REASONING_EFFORT') ?? 'none' }
    return {
      provider,
      apiKey: get(env, 'OPENAI_API_KEY'),
      keyVar: 'OPENAI_API_KEY',
      model,
      baseUrl: get(env, 'OPENAI_BASE_URL') ?? 'https://api.openai.com/v1',
      // Reasoning models take max_completion_tokens, not max_tokens.
      extraBody: { max_completion_tokens: 1000, ...reasoning },
    }
  }
  return {
    provider,
    apiKey: get(env, 'DEEPSEEK_API_KEY'),
    keyVar: 'DEEPSEEK_API_KEY',
    model: override?.model ?? get(env, 'DEEPSEEK_MODEL') ?? 'deepseek-flash',
    baseUrl: get(env, 'DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com',
    extraBody: { max_tokens: 1000, reasoning_effort: 'low' },
  }
}
