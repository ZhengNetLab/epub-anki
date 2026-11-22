// Floating "查词" button shown next to a selection, and the lookup panel it opens.

import type { SelectionInfo } from './selection'

const MARGIN = 8

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** Render `sentence` with the occurrence of `word` nearest `hint` wrapped in <mark>. */
function highlighted(sentence: string, word: string, hint: number): DocumentFragment {
  const frag = document.createDocumentFragment()
  const hay = sentence.toLowerCase()
  const needle = word.toLowerCase()
  let i = -1
  for (let j = hay.indexOf(needle); j >= 0; j = hay.indexOf(needle, j + 1))
    if (i < 0 || Math.abs(j - hint) < Math.abs(i - hint)) i = j
  if (i < 0) {
    frag.append(sentence)
    return frag
  }
  frag.append(sentence.slice(0, i), el('mark', undefined, sentence.slice(i, i + word.length)),
    sentence.slice(i + word.length))
  return frag
}

/** Position `box` near `anchor` (viewport coords), preferring `prefer` side, clamped to the viewport. */
function place(box: HTMLElement, anchor: DOMRect, prefer: 'above' | 'below') {
  const { offsetWidth: w, offsetHeight: h } = box
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const roomAbove = anchor.top - MARGIN
  const roomBelow = vh - anchor.bottom - MARGIN
  const above = prefer === 'above' ? roomAbove >= h || roomAbove > roomBelow : roomBelow < h && roomAbove > roomBelow
  let top = above ? anchor.top - h - MARGIN : anchor.bottom + MARGIN
  top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN))
  let left = anchor.left + anchor.width / 2 - w / 2
  left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN))
  box.style.top = `${top}px`
  box.style.left = `${left}px`
}

export class LookupUI {
  #button = el('button', 'lookup-btn', '查词')
  #panel = el('div', 'lookup-panel')
  #current: SelectionInfo | null = null

  constructor() {
    this.#button.hidden = true
    this.#panel.hidden = true
    this.#panel.setAttribute('role', 'dialog')
    document.body.append(this.#button, this.#panel)

    // Keep the book's selection intact when pressing the button.
    this.#button.addEventListener('pointerdown', (e) => e.preventDefault())
    this.#button.addEventListener('click', () => {
      if (this.#current) this.#openPanel(this.#current)
    })
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node
      if (!this.#panel.contains(t) && !this.#button.contains(t)) this.hide()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide()
    })
  }

  /** Called whenever the book selection changes. */
  onSelection(info: SelectionInfo | null) {
    if (!info) {
      this.hide()
      return
    }
    this.#current = info
    this.#panel.hidden = true
    this.#button.hidden = false
    place(this.#button, info.rect, 'above')
  }

  hide() {
    this.#button.hidden = true
    this.#panel.hidden = true
    this.#current = null
  }

  #openPanel(info: SelectionInfo) {
    this.#button.hidden = true
    const close = el('button', 'lookup-close', '×')
    close.title = '关闭'
    close.addEventListener('click', () => this.hide())

    const head = el('div', 'lookup-head')
    head.append(el('div', 'lookup-word', info.text), close)

    const context = el('p', 'lookup-context')
    context.append(highlighted(info.sentence, info.text, info.offset))

    // Stage 3 replaces this with the AI result.
    const body = el('div', 'lookup-body', 'AI 释义将在下一阶段接入。')

    this.#panel.replaceChildren(head, context, body)
    this.#panel.hidden = false
    place(this.#panel, info.rect, 'below')
  }
}
