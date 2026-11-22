// AI lookup: one Chat Completions call returning JSON. Runs in the browser (and in Node
// for scripts/bench-lookup.ts), so it must not touch the DOM.

import type { LookupRequest, LookupResult } from './lookup-types.ts'
import { PROVIDERS, requestExtras, type AiConfig } from './providers.ts'

export const SYSTEM_PROMPT = `你是一个面向中文母语读者的词典助手。用户在读外文书时选中了一个词或短语，并给出它所在的句子。
请根据句子语境解释它，只输出一个 JSON 对象，字段如下：
- "lemma": 词典原形（如 ran → run；短语给出常见形式）
- "phonetic": 音标（英语用 IPA，如 /ˈkændə/；短语或不适用时为空字符串）
- "pos": 词性缩写（如 n. / v. / adj. / adv. / phr.）
- "meaning": 在此语境中的中文释义，简洁，不超过 30 字
- "note": 一句中文补充说明（如搭配、语气、与常见义的区别）；没有必要时为空字符串
- "translation": 整个句子的通顺中文翻译
不要输出 JSON 以外的任何内容。`

const MAX_SENTENCE = 1500

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')

export async function lookup(req: LookupRequest, cfg: AiConfig): Promise<LookupResult> {
  const user = [
    `词语：${req.word}`,
    `句子：${req.sentence.slice(0, MAX_SENTENCE) || '（无）'}`,
    req.lang ? `书的语言：${req.lang}` : '',
  ].filter(Boolean).join('\n')

  let res: Response
  try {
    res = await fetch(`${PROVIDERS[cfg.provider].baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        response_format: { type: 'json_object' },
        ...requestExtras(cfg),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError'
    // OpenAI's error responses (e.g. 401 for a bad key) carry no CORS headers, so in a
    // browser a rejected key surfaces as a network failure rather than a readable 401.
    throw new Error(timedOut ? 'AI 服务响应超时' : '请求失败：请检查网络连接，以及 API key 是否正确')
  }

  const data = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    | null
  if (!res.ok) {
    if (res.status === 401) throw new Error('API key 无效或已失效，请在设置里检查')
    if (res.status === 429) throw new Error('请求太频繁或额度不足（429）')
    throw new Error(`AI 服务出错（${res.status}）：${data?.error?.message ?? res.statusText}`)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? '')
  } catch {
    throw new Error('AI 返回的内容无法解析')
  }
  const result: LookupResult = {
    lemma: str(parsed.lemma) || req.word,
    phonetic: str(parsed.phonetic),
    pos: str(parsed.pos),
    meaning: str(parsed.meaning),
    note: str(parsed.note),
    translation: str(parsed.translation),
  }
  if (!result.meaning) throw new Error('AI 没有给出释义')
  return result
}
