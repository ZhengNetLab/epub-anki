// Export cards as a tab-separated text file that Anki (2.1.55+) imports directly.
// The file header tells Anki the separator, that fields are HTML, the note type, and
// which columns hold tags and the deck, so no import settings need changing.
// Each book gets its own sub-deck (EPUB生词::<title>) via a per-row deck column, so
// one file can hold several books (verified with Anki 26.09's importer).

import type { Card } from './cards'
import { findNear } from './dom'

export const DECK = 'EPUB生词'

/** Anki deck for a book. '::' would create deeper sub-decks, so it's flattened; the
 *  deck column is plain text (not HTML), so only tabs/newlines/quotes are removed. */
export function deckName(bookTitle: string): string {
  const t = bookTitle.replace(/::/g, ':').replace(/[\t\r\n"]+/g, ' ').trim()
  return `${DECK}::${t || '未知书籍'}`
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Make a value safe for one TSV field: HTML-escaped, no tabs, newlines as <br>. */
const field = (html: string) =>
  html.replace(/\t/g, ' ').replace(/\r\n|\r|\n/g, '<br>')

/** Sentence with the looked-up word in bold. */
function sentenceHtml(c: Card): string {
  const i = findNear(c.sentence, c.word, c.offset)
  if (i < 0) return escapeHtml(c.sentence)
  return escapeHtml(c.sentence.slice(0, i)) + '<b>' + escapeHtml(c.sentence.slice(i, i + c.word.length)) +
    '</b>' + escapeHtml(c.sentence.slice(i + c.word.length))
}

export function cardBack(c: Card): string {
  const parts: string[] = [`<div>${escapeHtml(c.meaning)}</div>`]
  const meta = [c.phonetic, c.pos].filter(Boolean).map(escapeHtml).join(' ')
  const lemma = c.lemma && c.lemma.toLowerCase() !== c.word.toLowerCase() ? `原形 ${escapeHtml(c.lemma)}` : ''
  const metaLine = [meta, lemma].filter(Boolean).join(' · ')
  if (metaLine) parts.push(`<div style='color:#888;font-size:0.9em'>${metaLine}</div>`)
  if (c.note) parts.push(`<div style='margin-top:4px'>${escapeHtml(c.note)}</div>`)
  if (c.sentence) {
    parts.push('<hr>', `<div><i>${sentenceHtml(c)}</i></div>`)
    if (c.translation) parts.push(`<div style='margin-top:4px'>${escapeHtml(c.translation)}</div>`)
  }
  if (c.book) parts.push(`<div style='color:#888;font-size:0.8em;margin-top:6px'>— ${escapeHtml(c.book)}</div>`)
  return parts.join('')
}

/** Anki tags can't contain spaces; keep letters/digits (any script), '-', '_'. */
const tag = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 60)

export function buildAnkiTsv(cards: readonly Card[]): string {
  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    '#tags column:3',
    '#deck column:4',
  ]
  // Oldest first, so Anki's "new card" order follows reading order.
  for (const c of [...cards].reverse()) {
    // A leading '#' would look like a header/comment line to Anki.
    const front = field(escapeHtml(c.word)).replace(/^#/, '&#35;')
    const tags = ['epub-anki', c.book ? tag(c.book) : ''].filter(Boolean).join(' ')
    lines.push([front, field(cardBack(c)), tags, deckName(c.book)].join('\t'))
  }
  return lines.join('\n') + '\n'
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** .tsv rather than .txt: AnkiMobile/AnkiDroid only offer to open .tsv/.csv text imports.
 *  Includes the book title when exporting a single book. */
export function exportFilename(bookTitle?: string, now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`
  const name = bookTitle?.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return `anki-${name || 'cards'}-${stamp}.tsv`
}
