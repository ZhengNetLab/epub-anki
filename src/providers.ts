// AI providers for the lookup. Both speak the OpenAI-compatible Chat Completions API
// and are called directly from the browser (both allow CORS) with the user's own key.

export type ProviderName = 'openai' | 'deepseek'

export interface ProviderInfo {
  label: string
  baseUrl: string
  defaultModel: string
  /** Suggested models for the settings picker (any model ID can be typed). */
  models: string[]
  /** Where to create an API key. */
  keyUrl: string
}

export const PROVIDERS: Record<ProviderName, ProviderInfo> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    // Cheapest current model (~$0.08 per 1000 lookups), ~1.8s median in our 2026-11-22 benchmark.
    defaultModel: 'gpt-6-luna',
    models: ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.4-nano', 'gpt-6.1-terra'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
}

export interface AiConfig {
  provider: ProviderName
  apiKey: string
  model: string
}

/** Provider/model-specific request body fields (token limit, reasoning effort). */
export function requestExtras({ provider, model }: Pick<AiConfig, 'provider' | 'model'>): Record<string, unknown> {
  if (provider === 'deepseek') return { max_tokens: 1000, reasoning_effort: 'low' }
  // OpenAI reasoning models take max_completion_tokens; gpt-4* are non-reasoning and
  // reject reasoning_effort. "none" skips reasoning for the lowest latency.
  return /^gpt-4/.test(model)
    ? { max_completion_tokens: 1000 }
    : { max_completion_tokens: 1000, reasoning_effort: 'none' }
}
