// The card list: words saved for Anki export. Persisted in localStorage.
// localStorage is per-browser and can be cleared; exporting (stage 5) is the durable copy.

import type { LookupResult } from './lookup-types'

export interface Card extends LookupResult {
  id: string
  /** Card front: the word as selected (editable). */
  word: string
  /** Sentence the word was looked up in. */
  sentence: string
  /** Position of the word within `sentence`, for highlighting. */
  offset: number
  /** Title of the book it came from. */
  book: string
  createdAt: number
}

export type CardInput = Omit<Card, 'id' | 'createdAt'>
export type CardPatch = Partial<Pick<Card, 'word' | 'meaning' | 'note'>>

const KEY = 'epub-anki:cards'

const sameEntry = (a: { word: string; sentence: string }, b: { word: string; sentence: string }) =>
  a.word.toLowerCase() === b.word.toLowerCase() && a.sentence === b.sentence

class CardStore extends EventTarget {
  #cards: Card[] = []
  /** False when storage is unavailable; the list then lives only until the page closes. */
  persistent = true

  constructor() {
    super()
    try {
      const raw = localStorage.getItem(KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) this.#cards = parsed as Card[]
    } catch {
      this.persistent = false
    }
  }

  /** Cards, newest first. */
  list(): readonly Card[] {
    return this.#cards
  }

  get size() {
    return this.#cards.length
  }

  has(word: string, sentence: string) {
    return this.#cards.some((c) => sameEntry(c, { word, sentence }))
  }

  add(input: CardInput): Card {
    const existing = this.#cards.find((c) => sameEntry(c, input))
    if (existing) return existing
    const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    const card: Card = { ...input, id, createdAt: Date.now() }
    this.#cards.unshift(card)
    this.#changed()
    return card
  }

  update(id: string, patch: CardPatch) {
    const card = this.#cards.find((c) => c.id === id)
    if (!card) return
    Object.assign(card, patch)
    this.#changed()
  }

  /** Remove a card; returns what's needed to undo. */
  remove(id: string): { card: Card; index: number } | null {
    const index = this.#cards.findIndex((c) => c.id === id)
    if (index < 0) return null
    const [card] = this.#cards.splice(index, 1)
    this.#changed()
    return { card, index }
  }

  restore({ card, index }: { card: Card; index: number }) {
    if (this.#cards.some((c) => c.id === card.id)) return
    this.#cards.splice(Math.min(index, this.#cards.length), 0, card)
    this.#changed()
  }

  #changed() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#cards))
      this.persistent = true
    } catch {
      this.persistent = false
    }
    this.dispatchEvent(new Event('change'))
  }
}

export const cards = new CardStore()
