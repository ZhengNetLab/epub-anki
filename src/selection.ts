// Watches text selection inside a book section document (an iframe) and reports
// the selected word/phrase plus the sentence it appears in.

export interface SelectionInfo {
  /** Selected text, trimmed of surrounding whitespace and punctuation. */
  text: string
  /** The sentence containing the selection (for context-aware lookup). */
  sentence: string
  /** Approximate index of the selection within `sentence` (to pick the right occurrence). */
  offset: number
  /** Book language passed through for the lookup. */
  lang: string
  /** Selection bounds in the top-level window's viewport coordinates. */
  rect: DOMRect
}

/** Longest selection we treat as a lookup target (words or short phrases). */
const MAX_LEN = 80

const BLOCK_SELECTOR = 'p, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, figcaption, pre'

const trimPunct = (s: string) =>
  s.trim().replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '')

/** Find the sentence in the containing block that overlaps the selected range. */
function extractSentence(range: Range, lang: string): { sentence: string; offset: number } {
  const doc = range.startContainer.ownerDocument!
  const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? (range.startContainer as Element)
    : range.startContainer.parentElement
  const block = startEl?.closest(BLOCK_SELECTOR) ?? doc.body
  const text = block.textContent ?? ''

  // Character offsets of the selection within the block's text.
  const pre = doc.createRange()
  pre.setStart(block, 0)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  const end = start + range.toString().length

  let parts: Array<{ segment: string; index: number }>
  try {
    parts = [...new Intl.Segmenter(lang || undefined, { granularity: 'sentence' }).segment(text)]
  } catch {
    parts = [{ segment: text, index: 0 }]
  }
  const hit = parts.filter((p) => p.index < end && p.index + p.segment.length > start)
  const first = hit[0]?.index ?? 0
  const raw = hit.map((p) => p.segment).join('') || text
  // Normalize whitespace; collapsing a prefix keeps it a prefix, so offsets stay aligned.
  const sentence = raw.replace(/\s+/g, ' ').trim()
  const offset = raw.slice(0, start - first).replace(/\s+/g, ' ').trimStart().length
  return { sentence, offset }
}

/** Convert a rect inside the iframe to top-level viewport coordinates. */
function toTopRect(rect: DOMRect, doc: Document): DOMRect {
  let x = rect.left
  let y = rect.top
  let win: Window | null = doc.defaultView
  while (win && win !== window.top && win.frameElement) {
    const fr = win.frameElement.getBoundingClientRect()
    x += fr.left
    y += fr.top
    win = win.parent
  }
  return new DOMRect(x, y, rect.width, rect.height)
}

export function readSelection(doc: Document, lang: string): SelectionInfo | null {
  const sel = doc.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  return infoFromRange(sel.getRangeAt(0), doc, lang)
}

/** Build lookup info (text, sentence, position) for any range in a book document. */
export function infoFromRange(range: Range, doc: Document, lang: string): SelectionInfo | null {
  const text = trimPunct(range.toString().replace(/\s+/g, ' '))
  if (!text || text.length > MAX_LEN) return null
  const rects = range.getClientRects()
  // Anchor to the first line box so multi-line selections place the popup sensibly.
  const r = rects.length ? rects[0] : range.getBoundingClientRect()
  return { text, ...extractSentence(range, lang), lang, rect: toTopRect(r, doc) }
}

/**
 * Calls `onChange(info)` when the user finishes selecting text in `doc`, and
 * `onChange(null)` when the selection is cleared.
 */
export function watchSelection(
  doc: Document,
  lang: string,
  onChange: (info: SelectionInfo | null) => void,
  signal: AbortSignal,
) {
  let pointerDown = false
  let timer: number | undefined
  const report = () => {
    clearTimeout(timer)
    onChange(readSelection(doc, lang))
  }
  doc.addEventListener('pointerdown', (e) => {
    // Touch selection (long-press, handle drags) ends with pointercancel rather than
    // pointerup, so only mouse/pen drags are gated on pointerup.
    pointerDown = e.pointerType !== 'touch'
    onChange(null)
  }, { signal })
  // Mouse/pen: wait until the drag ends. Small delay lets double-click selection settle.
  doc.addEventListener('pointerup', (e) => {
    pointerDown = false
    if (e.pointerType === 'touch') return
    clearTimeout(timer)
    timer = window.setTimeout(report, 10)
  }, { signal })
  doc.addEventListener('pointercancel', () => { pointerDown = false }, { signal })
  // Keyboard and touch selection: debounce selection changes.
  doc.addEventListener('selectionchange', () => {
    if (pointerDown) return
    clearTimeout(timer)
    timer = window.setTimeout(report, 300)
  }, { signal })
  signal.addEventListener('abort', () => clearTimeout(timer))
}
