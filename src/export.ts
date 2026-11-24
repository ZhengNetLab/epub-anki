// Export cards as a tab-separated text file that Anki (2.1.55+) imports directly.
// The file header tells Anki the separator, that fields are HTML, the note type, and
// which columns hold tags and the deck, so no import settings need changing.
// Each book gets its own sub-deck (EPUB生词::<title>) via a per-row deck column, so
// one file can hold several books (verified with Anki 26.09's importer).

import { normFront, selectedText, type Card } from './cards'
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
  // Bold the form as it appears in the sentence (the front may be a lemma like aussehen).
  const w = selectedText(c)
  const i = findNear(c.sentence, w, c.offset)
  if (i < 0) return escapeHtml(c.sentence)
  return escapeHtml(c.sentence.slice(0, i)) + '<b>' + escapeHtml(c.sentence.slice(i, i + w.length)) +
    '</b>' + escapeHtml(c.sentence.slice(i + w.length))
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

/** 53-bit string hash (cyrb53), as hex. */
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/**
 * Anki note GUID: one per (deck, front). Anki matches notes by GUID before anything else,
 * so the same front in two books (two decks) stays two notes, and re-exporting a book
 * updates its existing notes instead of adding copies. (Anki's own duplicate check
 * compares fronts across all decks, and no file header can limit it to one deck.)
 */
export const cardGuid = (c: Card) => `ea-${hash(`${deckName(c.book)}\u0000${normFront(c.word)}`)}`

export function buildAnkiTsv(cards: readonly Card[]): string {
  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    '#tags column:3',
    '#deck column:4',
    '#guid column:5',
  ]
  const seen = new Set<string>()
  // Oldest first, so Anki's "new card" order follows reading order. Of cards sharing a
  // front in one book (only possible from before the duplicate rule), the oldest wins.
  for (const c of [...cards].reverse()) {
    const guid = cardGuid(c)
    if (seen.has(guid)) continue
    seen.add(guid)
    // A leading '#' would look like a header/comment line to Anki.
    const front = field(escapeHtml(c.word)).replace(/^#/, '&#35;')
    const tags = ['epub-anki', c.book ? tag(c.book) : ''].filter(Boolean).join(' ')
    lines.push([front, field(cardBack(c)), tags, deckName(c.book), guid].join('\t'))
  }
  return lines.join('\n') + '\n'
}

/**
 * Hand the export to the user. On iPhone/iPad, use the system share sheet (Save to Files,
 * or straight into AnkiMobile): Safari's handling of downloaded blob: files is unreliable,
 * especially in home-screen apps. Elsewhere, download the file.
 * Must be called from a user gesture (the share sheet requires one).
 */
export async function saveText(filename: string, text: string, ios: boolean): Promise<void> {
  if (ios && navigator.canShare) {
    for (const type of ['text/tab-separated-values', 'text/plain']) {
      const file = new File([text], filename, { type })
      if (!navigator.canShare({ files: [file] })) continue
      try {
        await navigator.share({ files: [file] })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return // user closed the sheet
        break // sharing failed: fall back to a download
      }
    }
  }
  downloadText(filename, text)
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
