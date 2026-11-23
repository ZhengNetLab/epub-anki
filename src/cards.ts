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
  /** Library id of that book. Missing on cards made before per-book lists (see linkLegacy). */
  bookId?: string
  createdAt: number
}

/** Which book's list a card belongs to: its library id, or its title for unlinked cards. */
export const bookKey = (c: { bookId?: string; book: string }) => c.bookId ?? `title:${c.book}`

export interface CardGroup {
  key: string
  title: string
  /** Newest first. */
  cards: Card[]
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

  /** One book's cards, newest first. */
  forBook(key: string): Card[] {
    return this.#cards.filter((c) => bookKey(c) === key)
  }

  /** All cards grouped by book, books ordered by their newest card. */
  groups(): CardGroup[] {
    const map = new Map<string, CardGroup>()
    for (const c of this.#cards) {
      const key = bookKey(c)
      let g = map.get(key)
      if (!g) map.set(key, (g = { key, title: c.book || '未知书籍', cards: [] }))
      g.cards.push(c)
    }
    return [...map.values()]
  }

  has(word: string, sentence: string) {
    return this.#cards.some((c) => sameEntry(c, { word, sentence }))
  }

  /** Attach library ids to older cards that only recorded the book title. */
  linkLegacy(books: ReadonlyArray<{ id: string; title: string }>) {
    let changed = false
    for (const c of this.#cards) {
      if (c.bookId) continue
      const match = books.find((b) => b.title === c.book)
      if (match) {
        c.bookId = match.id
        changed = true
      }
    }
    if (changed) this.#changed()
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
