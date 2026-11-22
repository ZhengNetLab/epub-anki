// Server-side AI lookup. Runs inside the Vite (Node) process so the API key
// never reaches the browser.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { LookupRequest, LookupResult } from '../src/lookup-types.ts'
import type { LookupConfig } from './providers.ts'

export type { LookupConfig }

const MAX_WORD = 80
const MAX_SENTENCE = 1500
const MAX_BODY = 16 * 1024

const SYSTEM_PROMPT = `你是一个面向中文母语读者的词典助手。用户在读外文书时选中了一个词或短语，并给出它所在的句子。
请根据句子语境解释它，只输出一个 JSON 对象，字段如下：
- "lemma": 词典原形（如 ran → run；短语给出常见形式）
- "phonetic": 音标（英语用 IPA，如 /ˈkændə/；短语或不适用时为空字符串）
- "pos": 词性缩写（如 n. / v. / adj. / adv. / phr.）
- "meaning": 在此语境中的中文释义，简洁，不超过 30 字
- "note": 一句中文补充说明（如搭配、语气、与常见义的区别）；没有必要时为空字符串
- "translation": 整个句子的通顺中文翻译
不要输出 JSON 以外的任何内容。`

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function parseRequest(body: unknown): LookupRequest {
  const b = body as Partial<LookupRequest> | null
  const word = typeof b?.word === 'string' ? b.word.trim() : ''
  const sentence = typeof b?.sentence === 'string' ? b.sentence.trim() : ''
  const lang = typeof b?.lang === 'string' ? b.lang.slice(0, 35) : ''
  if (!word) throw new HttpError(400, '缺少要查询的词')
  if (word.length > MAX_WORD) throw new HttpError(400, '选中的文字太长')
  return { word, sentence: sentence.slice(0, MAX_SENTENCE), lang }
}

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')

export async function lookup(req: LookupRequest, cfg: LookupConfig): Promise<LookupResult> {
  if (!cfg.apiKey) throw new HttpError(500, `服务器未配置 ${cfg.keyVar}（见 .env.example）`)

  const user = [
    `词语：${req.word}`,
    `句子：${req.sentence || '（无）'}`,
    req.lang ? `书的语言：${req.lang}` : '',
  ].filter(Boolean).join('\n')

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      response_format: { type: 'json_object' },
      ...cfg.extraBody,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e: unknown) => {
    const timedOut = e instanceof Error && e.name === 'TimeoutError'
    throw new HttpError(502, timedOut ? 'AI 服务响应超时' : '无法连接 AI 服务')
  })

  const data = await res.json().catch(() => null) as
    | { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    | null
  if (!res.ok) {
    const msg = data?.error?.message ?? res.statusText
    throw new HttpError(502, `AI 服务出错（${res.status}）：${msg}`)
  }

  const content = data?.choices?.[0]?.message?.content ?? ''
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new HttpError(502, 'AI 返回的内容无法解析')
  }
  const result: LookupResult = {
    lemma: str(parsed.lemma) || req.word,
    phonetic: str(parsed.phonetic),
    pos: str(parsed.pos),
    meaning: str(parsed.meaning),
    note: str(parsed.note),
    translation: str(parsed.translation),
  }
  if (!result.meaning) throw new HttpError(502, 'AI 没有给出释义')
  return result
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new HttpError(413, '请求太大')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, '请求格式错误')
  }
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/** Connect-style handler for POST /api/lookup. */
export function createLookupHandler(cfg: LookupConfig) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
    // Block cross-site calls (another web page POSTing to localhost would spend API credit):
    // require JSON (forces a CORS preflight) and, when the browser sends Origin, the same host.
    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Forbidden' })
    if (!req.headers['content-type']?.startsWith('application/json'))
      return send(res, 415, { error: 'Expected application/json' })
    try {
      const input = parseRequest(await readJson(req))
      send(res, 200, await lookup(input, cfg))
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      const message = e instanceof HttpError ? e.message : '查询失败'
      if (!(e instanceof HttpError)) console.error('[lookup]', e)
      send(res, status, { error: message })
    }
  }
}
