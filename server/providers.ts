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
    return {
      provider,
      apiKey: get(env, 'OPENAI_API_KEY'),
      keyVar: 'OPENAI_API_KEY',
      // GPT-6 Luna: OpenAI's smallest/cheapest current model, supports reasoning_effort "none".
      model: override?.model ?? get(env, 'OPENAI_MODEL') ?? 'gpt-6-luna',
      baseUrl: get(env, 'OPENAI_BASE_URL') ?? 'https://api.openai.com/v1',
      extraBody: {
        // Reasoning models take max_completion_tokens, not max_tokens.
        max_completion_tokens: 1000,
        // "none" skips reasoning tokens entirely: lowest latency for a short dictionary answer.
        reasoning_effort: get(env, 'OPENAI_REASONING_EFFORT') ?? 'none',
      },
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
