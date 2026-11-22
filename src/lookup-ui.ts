// Floating "查词" button shown next to a selection, and the lookup panel it opens.

import type { SelectionInfo } from './selection'
import type { LookupResult } from './lookup-types'
import { lookupWord } from './lookup-client'
import { el, highlighted } from './dom'
import { cards } from './cards'

const MARGIN = 8

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
  /** Incremented per lookup; stale responses are ignored. */
  #request = 0
  #book = ''

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

  /** Title of the open book, stored on cards. */
  setBook(title: string) {
    this.#book = title
  }

  hide() {
    this.#button.hidden = true
    this.#panel.hidden = true
    this.#current = null
    this.#request++
  }

  #openPanel(info: SelectionInfo) {
    this.#button.hidden = true
    const token = ++this.#request
    const close = el('button', 'lookup-close', '×')
    close.title = '关闭'
    close.addEventListener('click', () => this.hide())

    const head = el('div', 'lookup-head')
    head.append(el('div', 'lookup-word', info.text), close)

    const body = el('div', 'lookup-body')
    const context = el('div', 'lookup-context')
    context.append(el('p', 'lookup-sentence'))
    context.firstElementChild!.append(highlighted(info.sentence, info.text, info.offset))

    this.#panel.replaceChildren(head, body, context)
    this.#panel.hidden = false

    const run = () => {
      body.replaceChildren(el('div', 'lookup-status', '查询中…'))
      place(this.#panel, info.rect, 'below')
      lookupWord({ word: info.text, sentence: info.sentence, lang: info.lang }).then(
        (r) => {
          if (token !== this.#request) return
          this.#renderResult(info, r, head, body, context)
          place(this.#panel, info.rect, 'below')
        },
        (e: unknown) => {
          if (token !== this.#request) return
          const retry = el('button', 'text-btn', '重试')
          retry.addEventListener('click', run)
          const status = el('div', 'lookup-status lookup-error', e instanceof Error ? e.message : String(e))
          body.replaceChildren(status, retry)
          place(this.#panel, info.rect, 'below')
        },
      )
    }
    run()
  }

  #renderResult(info: SelectionInfo, r: LookupResult, head: HTMLElement, body: HTMLElement, context: HTMLElement) {
    const meta = el('div', 'lookup-meta')
    const bits = [r.phonetic, r.pos].filter(Boolean)
    if (bits.length) meta.append(bits.join('  '))
    if (r.lemma && r.lemma.toLowerCase() !== info.text.toLowerCase()) {
      if (bits.length) meta.append('  ·  ')
      meta.append('原形 ', el('b', undefined, r.lemma))
    }
    if (meta.childNodes.length) head.after(meta)

    body.replaceChildren(el('div', 'lookup-meaning', r.meaning))
    if (r.note) body.append(el('div', 'lookup-note', r.note))
    if (r.translation) context.append(el('p', 'lookup-translation', r.translation))

    const add = el('button', 'primary-btn')
    const sync = () => {
      const added = cards.has(info.text, info.sentence)
      add.textContent = added ? '✓ 已加入卡片' : '加入卡片'
      add.disabled = added
    }
    sync()
    add.addEventListener('click', () => {
      cards.add({ ...r, word: info.text, sentence: info.sentence, offset: info.offset, book: this.#book })
      sync()
    })
    const actions = el('div', 'lookup-actions')
    actions.append(add)
    context.after(actions)
  }
}
