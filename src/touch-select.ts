// Touch word selection without the browser's native text selection.
//
// On Android, a native selection makes Chrome show its own action menu (Copy / Share /
// Web search) and the Google "Touch to Search" bar. To avoid both, touch devices turn off
// native selection in book pages (user-select: none) and we implement it ourselves:
// long-press selects the word under the finger, keep holding and drag to extend to a
// phrase, release to show the lookup button. The selection is drawn with the CSS Custom
// Highlight API instead of ::selection.

import { infoFromRange, type SelectionInfo } from './selection'

const LONG_PRESS_MS = 450
/** Finger movement (px) that turns a pending long-press into a swipe/scroll. */
const MOVE_TOLERANCE = 10
const HIGHLIGHT = 'epub-lookup'

const STYLE = `
  html { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  ::highlight(${HIGHLIGHT}) { background-color: rgba(47, 111, 219, 0.35); }
`

type Win = Window & typeof globalThis

/** The word (Intl.Segmenter word-like segment) at a viewport point, as a Range. */
function wordAt(doc: Document, x: number, y: number, lang: string): Range | null {
  let node: Node | null = null
  let offset = 0
  const d = doc as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null
  }
  const pos = d.caretPositionFromPoint?.(x, y)
  if (pos) {
    node = pos.offsetNode
    offset = pos.offset
  } else {
    const r = doc.caretRangeFromPoint?.(x, y)
    if (r) {
      node = r.startContainer
      offset = r.startOffset
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const text = (node as Text).data
  let segments: Iterable<{ segment: string; index: number; isWordLike?: boolean }>
  try {
    segments = new Intl.Segmenter(lang || undefined, { granularity: 'word' }).segment(text)
  } catch {
    return null
  }
  for (const s of segments) {
    const end = s.index + s.segment.length
    // Caret positions sit between characters; accept a hit on either edge of the word.
    if (s.isWordLike && offset >= s.index && offset <= end) {
      // Make sure the point is really over this word, not just the nearest caret position.
      const range = doc.createRange()
      range.setStart(node, s.index)
      range.setEnd(node, end)
      const hit = [...range.getClientRects()].some((r) =>
        x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)
      return hit ? range : null
    }
  }
  return null
}

/** Range covering both `a` and `b`, whichever comes first in the document. */
function spanning(doc: Document, a: Range, b: Range): Range {
  const r = doc.createRange()
  const aFirst = a.compareBoundaryPoints(Range.START_TO_START, b) <= 0
  const first = aFirst ? a : b
  const last = a.compareBoundaryPoints(Range.END_TO_END, b) >= 0 ? a : b
  r.setStart(first.startContainer, first.startOffset)
  r.setEnd(last.endContainer, last.endOffset)
  return r
}

export interface TouchSelect {
  /** Remove the highlight (e.g. when the lookup UI closes or the page turns). */
  clear(): void
}

export function enableTouchSelect(
  doc: Document,
  lang: string,
  onChange: (info: SelectionInfo | null) => void,
  signal: AbortSignal,
): TouchSelect {
  const win = doc.defaultView as Win | null
  const style = doc.createElement('style')
  style.textContent = STYLE
  ;(doc.head ?? doc.documentElement).append(style)

  const highlights = (win?.CSS as typeof CSS | undefined)?.highlights
  const HighlightCtor = (win as (Win & { Highlight?: typeof Highlight }) | null)?.Highlight
  const show = (range: Range | null) => {
    if (!highlights || !HighlightCtor) return
    if (range) highlights.set(HIGHLIGHT, new HighlightCtor(range))
    else highlights.delete(HIGHLIGHT)
  }

  let timer: number | undefined
  let start: { x: number; y: number } | null = null
  let anchor: Range | null = null
  let current: Range | null = null
  let selecting = false

  const reset = () => {
    clearTimeout(timer)
    start = null
    selecting = false
  }

  const opts = { capture: true, passive: false, signal } as const
  const target = win ?? doc

  target.addEventListener('touchstart', (e) => {
    const t = (e as TouchEvent).touches
    reset()
    if (t.length !== 1) return
    start = { x: t[0].clientX, y: t[0].clientY }
    timer = window.setTimeout(() => {
      if (!start) return
      const word = wordAt(doc, start.x, start.y, lang)
      if (!word) return
      selecting = true
      anchor = current = word
      show(word)
      navigator.vibrate?.(10)
    }, LONG_PRESS_MS)
  }, opts)

  target.addEventListener('touchmove', (e) => {
    const touch = (e as TouchEvent).touches[0]
    if (!touch || !start) return
    if (!selecting) {
      // Moving past the tolerance before the long-press fires means the user is swiping:
      // cancel and let foliate-js page. Smaller jitter is withheld from foliate-js so it
      // doesn't nudge the page while the user may still be pressing to select.
      if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > MOVE_TOLERANCE) {
        reset()
        return
      }
      // Not preventDefault: Chrome decides on the first touchmove whether a gesture may
      // scroll natively, and cancelling it would break scrolling in "scrolled" flow.
      e.stopImmediatePropagation()
      return
    }
    // Extending a selection: keep the move away from foliate-js's swipe-to-turn.
    e.preventDefault()
    e.stopImmediatePropagation()
    const word = wordAt(doc, touch.clientX, touch.clientY, lang)
    if (word && anchor) {
      current = spanning(doc, anchor, word)
      show(current)
    }
  }, opts)

  const end = (e: Event) => {
    const wasSelecting = selecting
    reset()
    if (!wasSelecting) return
    // Suppress the click that would follow (tap-to-turn-page, link activation), and keep
    // foliate-js from "snapping" the page on touchend: that fires a relocate, which closes
    // the lookup UI right after it opens. No moves reached foliate-js, so no snap is needed.
    e.preventDefault()
    e.stopImmediatePropagation()
    const info = current ? infoFromRange(current, doc, lang) : null
    if (info) onChange(info)
    else show(null)
  }
  target.addEventListener('touchend', end, opts)
  target.addEventListener('touchcancel', () => reset(), opts)

  // Long-press on text/images would otherwise open the browser's context menu.
  doc.addEventListener('contextmenu', (e) => e.preventDefault(), { signal })

  return {
    clear() {
      anchor = current = null
      show(null)
    },
  }
}
