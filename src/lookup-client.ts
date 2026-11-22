import type { LookupRequest, LookupResult } from './lookup-types'
import { lookup } from './ai'
import { settings } from './settings'

/** Thrown when no API key is configured, so the UI can offer to open settings. */
export class NoKeyError extends Error {
  constructor() {
    super('还没有设置 API key')
  }
}

// Session cache so re-opening the same word in the same sentence doesn't call the API again.
const cache = new Map<string, Promise<LookupResult>>()

export function lookupWord(req: LookupRequest): Promise<LookupResult> {
  const cfg = settings.config()
  if (!cfg) return Promise.reject(new NoKeyError())
  const key = JSON.stringify([cfg.provider, cfg.model, req.word.toLowerCase(), req.sentence])
  let p = cache.get(key)
  if (!p) {
    p = lookup(req, cfg)
    cache.set(key, p)
    p.catch(() => cache.delete(key)) // allow retry after failures
  }
  return p
}
