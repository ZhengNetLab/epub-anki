import 'foliate-js/view.js'
import { createTOCView } from 'foliate-js/ui/tree.js'
import { watchSelection } from './selection'
import { LookupUI } from './lookup-ui'
import type { Contributor, FoliateView, LanguageMap, LoadDetail, RelocateDetail } from './types'

// CSS injected into each book section (adapted from foliate-js reader.js).
const BOOK_CSS = `
  @namespace epub "http://www.idpf.org/2007/ops";
  html { color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { a:link { color: lightblue; } }
  p, li, blockquote, dd {
    line-height: 1.6;
    text-align: start;
    hanging-punctuation: allow-end last;
    widows: 2;
  }
  [align="left"] { text-align: left; }
  [align="right"] { text-align: right; }
  [align="center"] { text-align: center; }
  [align="justify"] { text-align: justify; }
  pre { white-space: pre-wrap !important; }
  aside[epub|type~="endnote"], aside[epub|type~="footnote"],
  aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
`

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!

const formatLang = (x?: LanguageMap): string => {
  if (!x) return ''
  if (typeof x === 'string') return x
  const keys = Object.keys(x)
  return x[keys[0]] ?? ''
}

const formatContributor = (c?: Contributor): string => {
  if (!c) return ''
  const one = (x: string | { name: LanguageMap }) => (typeof x === 'string' ? x : formatLang(x.name))
  return Array.isArray(c) ? c.map(one).join(', ') : one(c)
}

const lookup = new LookupUI()

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent' })

// Remember last reading position per book (per-browser convenience only).
const posKey = (title: string, author: string) => `epub-anki:pos:${title}::${author}`
const loadPos = (key: string) => {
  try { return localStorage.getItem(key) ?? undefined } catch { return undefined }
}
const savePos = (key: string, cfi: string) => {
  try { localStorage.setItem(key, cfi) } catch { /* storage unavailable */ }
}

export interface Reader {
  view: FoliateView
  destroy(): void
}

export async function openBook(file: File | string): Promise<Reader> {
  const container = $('#viewer')
  const view = document.createElement('foliate-view') as FoliateView
  container.append(view)

  try {
    await view.open(file)
  } catch (e) {
    view.remove()
    throw e
  }

  const ac = new AbortController()
  const { signal } = ac
  const { book } = view

  const fileName = typeof file === 'string' ? decodeURIComponent(file.split('/').pop() ?? '') : file.name
  const title = formatLang(book.metadata?.title) || fileName.replace(/\.epub$/i, '')
  const author = formatContributor(book.metadata?.author)
  const key = posKey(title, author)
  const rawLang = book.metadata?.language
  const lang = (Array.isArray(rawLang) ? rawLang[0] : rawLang) ?? ''

  document.title = title
  lookup.setBook(title)
  $('#book-title').textContent = title
  $('#sidebar-title').textContent = title
  $('#sidebar-author').textContent = author

  const cover = $<HTMLImageElement>('#cover')
  cover.hidden = true
  Promise.resolve(book.getCover?.()).then((blob) => {
    if (blob && !signal.aborted) {
      cover.src = URL.createObjectURL(blob)
      cover.hidden = false
    }
  }).catch(() => {})

  // ---- navigation ----
  const prevBtn = $('#prev-button')
  const nextBtn = $('#next-button')
  prevBtn.hidden = nextBtn.hidden = false
  prevBtn.addEventListener('click', () => view.goLeft(), { signal })
  nextBtn.addEventListener('click', () => view.goRight(), { signal })

  const onKey = (e: KeyboardEvent) => {
    // Don't steal keys from form fields (e.g. editing a card).
    if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')) return
    // Leave modified arrows (e.g. Shift+Arrow to extend a selection) to the browser.
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') view.goLeft()
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') view.goRight()
    else return
    e.preventDefault()
  }
  document.addEventListener('keydown', onKey, { signal })

  // Book content lives in iframes; attach handlers to each section document as it loads.
  view.addEventListener('load', (e) => {
    const { doc } = (e as CustomEvent<LoadDetail>).detail
    doc.addEventListener('keydown', onKey, { signal })
    doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') lookup.hide() }, { signal })
    watchSelection(doc, lang, (info) => lookup.onSelection(info), signal)
  }, { signal })

  // ---- progress ----
  const footer = $('#bottombar')
  const slider = $<HTMLInputElement>('#progress')
  const locLabel = $('#location')
  const ticks = $('#tick-marks')
  footer.hidden = false
  slider.dir = book.dir ?? 'ltr'
  ticks.replaceChildren(...view.getSectionFractions().map((f) => {
    const o = document.createElement('option')
    o.value = String(f)
    return o
  }))
  slider.addEventListener('input', () => view.goToFraction(parseFloat(slider.value)), { signal })

  // ---- table of contents ----
  const tocBtn = $<HTMLButtonElement>('#toc-button')
  const sidebar = $('#sidebar')
  const dim = $('#dim')
  const tocNav = $('#toc')
  const openSidebar = () => { lookup.hide(); sidebar.classList.add('show'); sidebar.ariaHidden = 'false'; dim.hidden = false }
  const closeSidebar = () => { sidebar.classList.remove('show'); sidebar.ariaHidden = 'true'; dim.hidden = true }
  let tocView: ReturnType<typeof createTOCView> | null = null
  tocNav.replaceChildren()
  if (book.toc?.length) {
    tocView = createTOCView(book.toc, (href) => {
      view.goTo(href).catch(console.error)
      closeSidebar()
    })
    tocNav.append(tocView.element)
  }
  tocBtn.disabled = false
  tocBtn.addEventListener('click', openSidebar, { signal })
  dim.addEventListener('click', closeSidebar, { signal })

  view.addEventListener('relocate', (e) => {
    const { fraction, location, tocItem, pageItem, cfi } = (e as CustomEvent<RelocateDetail>).detail
    lookup.hide()
    slider.value = String(fraction)
    const where = pageItem?.label ? `第 ${pageItem.label} 页`
      : location ? `位置 ${location.current + 1}/${location.total}` : ''
    locLabel.textContent = [tocItem?.label?.trim(), where, percent.format(fraction)].filter(Boolean).join(' · ')
    if (tocItem?.href) tocView?.setCurrentHref(tocItem.href)
    if (cfi) savePos(key, cfi)
  }, { signal })

  view.renderer.setStyles?.(BOOK_CSS)
  await view.init({ lastLocation: loadPos(key), showTextStart: true })

  return {
    view,
    destroy() {
      ac.abort()
      lookup.hide()
      closeSidebar()
      view.close()
      view.remove()
    },
  }
}
