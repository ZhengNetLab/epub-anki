// Formatting helpers for foliate-js book metadata.

import type { Contributor, LanguageMap } from './types'

export const formatLang = (x?: LanguageMap): string => {
  if (!x) return ''
  if (typeof x === 'string') return x
  const keys = Object.keys(x)
  return x[keys[0]] ?? ''
}

export const formatContributor = (c?: Contributor): string => {
  if (!c) return ''
  const one = (x: string | { name: LanguageMap }) => (typeof x === 'string' ? x : formatLang(x.name))
  return Array.isArray(c) ? c.map(one).join(', ') : one(c)
}
