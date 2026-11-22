import type { LookupError, LookupRequest, LookupResult } from './lookup-types'

// Session cache so re-opening the same word in the same sentence doesn't call the API again.
const cache = new Map<string, Promise<LookupResult>>()

async function request(req: LookupRequest): Promise<LookupResult> {
  let res: Response
  try {
    res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    throw new Error('无法连接本地服务，请确认 npm run dev 正在运行')
  }
  const data = (await res.json().catch(() => null)) as LookupResult | LookupError | null
  if (!res.ok || !data || 'error' in data) {
    throw new Error((data && 'error' in data && data.error) || `查询失败（${res.status}）`)
  }
  return data
}

export function lookupWord(req: LookupRequest): Promise<LookupResult> {
  const key = JSON.stringify([req.word.toLowerCase(), req.sentence])
  let p = cache.get(key)
  if (!p) {
    p = request(req)
    cache.set(key, p)
    p.catch(() => cache.delete(key)) // allow retry after failures
  }
  return p
}
