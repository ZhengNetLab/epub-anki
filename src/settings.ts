// User settings (AI provider, API keys, models), stored only on this device.

import { PROVIDERS, type AiConfig, type ProviderName } from './providers.ts'

export interface Settings {
  provider: ProviderName
  keys: Partial<Record<ProviderName, string>>
  models: Partial<Record<ProviderName, string>>
}

const KEY = 'epub-anki:settings'

class SettingsStore extends EventTarget {
  #s: Settings = { provider: 'openai', keys: {}, models: {} }

  constructor() {
    super()
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const p = JSON.parse(raw) as Partial<Settings>
        if (p.provider && p.provider in PROVIDERS) this.#s.provider = p.provider
        this.#s.keys = { ...p.keys }
        this.#s.models = { ...p.models }
      }
    } catch { /* storage unavailable: defaults */ }
  }

  get(): Readonly<Settings> {
    return this.#s
  }

  set(next: Settings) {
    this.#s = next
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch { /* not persisted */ }
    this.dispatchEvent(new Event('change'))
  }

  /** Active AI config, or null when no key is set for the chosen provider. */
  config(): AiConfig | null {
    const { provider, keys, models } = this.#s
    const apiKey = keys[provider]?.trim()
    if (!apiKey) return null
    return { provider, apiKey, model: models[provider]?.trim() || PROVIDERS[provider].defaultModel }
  }
}

export const settings = new SettingsStore()
