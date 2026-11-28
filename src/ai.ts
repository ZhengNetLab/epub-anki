// AI lookup: one Chat Completions call returning JSON. Runs in the browser (and in Node
// for scripts/bench-lookup.ts), so it must not touch the DOM.

import type { LookupRequest, LookupResult, VerbForms } from './lookup-types.ts'
import { PROVIDERS, requestExtras, type AiConfig } from './providers.ts'

export const SYSTEM_PROMPT = `你是一个面向中文母语读者的词典助手。用户在读外文书时选中了一个词或短语，并给出它所在的句子。
请根据句子语境解释它，只输出一个 JSON 对象，字段如下：
- "lemma": 该词在本句中对应的词典词条原形（用作 Anki 卡片正面）。规则：
  · 还原屈折变化：ran → run，children → child，Häuser → Haus，sieht → sehen。
  · 可分动词、短语动词：若句中别处有与它配合的分离前缀或小品词，必须给出完整词条，
    例如 "Er sieht müde aus" 中的 sieht → aussehen；"Sie rief ihn an" 中的 rief → anrufen；
    "She gave the habit up" 中的 gave → give up。注意先检查句末或句中是否有分离出去的前缀。
  · 没有这种配合成分时只给单词本身的原形（"Er sieht den Hund" → sehen）。
  · 选中的是短语时，给出它的常见词典形式。
  · 名词：德语等有语法性别的语言，在单数主格前加定冠词，如 Frauen → die Frau，Häuser → das Haus，
    Tisch → der Tisch；只有复数形式的名词用复数冠词（die Leute）。其他有性别的语言同理用该语言的单数定冠词
    （法语元音前的 l' 看不出性别，后面注明 (m.) 或 (f.)，如 l'arbre (m.)）。英语等没有语法性别的语言不加冠词。
- "pos": 词性缩写（如 n. / v. / adj. / adv. / phr.）
- "forms": 不规则动词的变位；其他情况一律为 null。先判断 lemma 的核心动词是否不规则：
  · 不规则：德语强变化动词（sehen, kommen, rufen, stehen…）、混合变化动词（bringen, denken, kennen…）、
    情态动词、sein/haben/werden/wissen；英语不规则动词（go, run, give…）。
  · 规则（forms 必须为 null）：德语弱变化动词，如 machen, warten, spielen, kaufen；
    英语加 -ed 的动词，如 look up, play, want。非动词也为 null。
  不规则时给出对象，含三个字段；某部分本身是规则的就填空字符串。可分动词、短语动词按完整词条变位（带分离前缀/小品词）。
  · "present": 现在时里不规则的人称变位，带人称代词（er 代表 er/sie/es，sie 代表 sie/Sie）。
    只有词干变化（e→i/ie、a→ä、au→äu 等）或整体不规则才算，只列这些人称：
    sehen → "du siehst, er sieht"，fahren → "du fährst, er fährt"，aussehen → "du siehst aus, er sieht aus"，
    sein → "ich bin, du bist, er ist, wir sind, ihr seid, sie sind"，können → "ich kann, du kannst, er kann"；
    词干不变、只加普通词尾的（du kommst, er ruft, du bringst, du stehst auf）是规则的 → 空字符串。
    英语只有 be/have 等少数有：be → "I am, he is, we/you/they are"，have → "he has"；其余英语动词 → 空字符串。
  · "past": 过去式（德语 Präteritum、英语 simple past）。德语按人称列出、相同形式合并，
    如 sehen → "ich/er sah, du sahst, wir/sie sahen, ihr saht"，anrufen → "ich/er rief an, du riefst an, wir/sie riefen an, ihr rieft an"；
    英语如 go → "went"，give up → "gave up"。
  · "perfect": 现在完成时（助动词 + 过去分词），如 sehen → "hat gesehen"，gehen → "ist gegangen"，
    两种助动词都可用时都给（fahren → "ist/hat gefahren"）；英语如 go → "have/has gone"，give up → "have/has given up"
- "meaning": 在此语境中的中文释义，简洁，不超过 30 字
- "note": 一句中文补充说明（如搭配、语气、与常见义的区别）；没有必要时为空字符串
- "translation": 整个句子的通顺中文翻译
不要输出 JSON 以外的任何内容。`

const MAX_SENTENCE = 1500

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')

/** The "forms" object, or null when missing or entirely regular. */
function verbForms(x: unknown): VerbForms | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const f = { present: str(o.present), past: str(o.past), perfect: str(o.perfect) }
  return f.present || f.past || f.perfect ? f : null
}

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
    pos: str(parsed.pos),
    meaning: str(parsed.meaning),
    note: str(parsed.note),
    translation: str(parsed.translation),
    forms: verbForms(parsed.forms),
  }
  if (!result.meaning) throw new Error('AI 没有给出释义')
  return result
}
