import 'foliate-js/view.js'
import { createTOCView } from 'foliate-js/ui/tree.js'
import { watchSelection } from './selection'
import { enableTouchSelect } from './touch-select'
import { isTouchDevice } from './platform'
import { LookupUI } from './lookup-ui'
import type { FoliateView, LoadDetail, RelocateDetail } from './types'
import { formatContributor, formatLang } from './book-meta'
import { bookCss, MARGINS, readingPrefs } from './reading-prefs'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!

const lookup = new LookupUI()

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent' })

// Fallback position memory for books opened outside the library (e.g. the ?book= dev URL).
const posKey = (title: string, author: string) => `epub-anki:pos:${title}::${author}`
const loadPos = (key: string) => {
  try { return localStorage.getItem(key) ?? undefined } catch { return undefined }
}
const savePos = (key: string, cfi: string) => {
  try { localStorage.setItem(key, cfi) } catch { /* storage unavailable */ }
}

export interface Reader {
  view: FoliateView
  title: string
  /** Key of this book's card list (see bookKey in cards.ts). */
  bookKey: string
  destroy(): void
}

export interface OpenOptions {
  /** Library id, so cards made while reading go to this book's list. */
  bookId?: string
  /** Where to resume (EPUB CFI); defaults to the start of the text. */
  lastLocation?: string
  /** Called on every page change with the position and overall progress (0..1). */
  onLocation?: (cfi: string, fraction: number) => void
}

export async function openBook(file: File | string, opts: OpenOptions = {}): Promise<Reader> {
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
  // Touch screens use our own long-press selection (no native selection → no Chrome
  // action menu or Google "Touch to Search"). Each loaded section registers a clearer.
  const touch = matchMedia('(pointer: coarse)').matches
  const clearHighlights = new Set<() => void>()
  lookup.onHide = () => clearHighlights.forEach((c) => c())
  const { book } = view

  const fileName = typeof file === 'string' ? decodeURIComponent(file.split('/').pop() ?? '') : file.name
  const title = formatLang(book.metadata?.title) || fileName.replace(/\.epub$/i, '')
  const author = formatContributor(book.metadata?.author)
  const key = posKey(title, author)
  const rawLang = book.metadata?.language
  const lang = (Array.isArray(rawLang) ? rawLang[0] : rawLang) ?? ''

  document.title = title
  lookup.setBook({ id: opts.bookId, title })
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
    if (touch) {
      const ts = enableTouchSelect(doc, lang, (info) => lookup.onSelection(info), signal)
      clearHighlights.add(ts.clear)
      doc.defaultView?.addEventListener('pagehide', () => clearHighlights.delete(ts.clear), { signal })
    }

    // Touch: tap the left/right 30% of the screen to turn pages. A tap that only
    // dismisses a selection or the lookup panel doesn't turn the page.
    // On touch devices any tap counts: WebKit doesn't reliably report pointerType "touch"
    // on the click that follows a tap.
    const tapped = (ev: Event) => (ev as PointerEvent).pointerType === 'touch' || isTouchDevice()
    let dismissing = false
    doc.addEventListener('pointerdown', (ev) => {
      if (tapped(ev)) dismissing = lookup.visible || !doc.getSelection()?.isCollapsed
    }, { capture: true, signal })
    doc.addEventListener('click', (ev) => {
      if (!tapped(ev) || dismissing) return
      if ((ev.target as Element | null)?.closest?.('a')) return
      if (!doc.getSelection()?.isCollapsed) return
      const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
      const x = ev.clientX + (frame?.left ?? 0)
      const w = document.documentElement.clientWidth
      if (x < w * 0.3) view.goLeft()
      else if (x > w * 0.7) view.goRight()
    }, { signal })
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
    if (cfi) {
      if (opts.onLocation) opts.onLocation(cfi, fraction)
      else savePos(key, cfi)
    }
  }, { signal })

  // Reading preferences: apply now and live whenever they change.
  const applyPrefs = () => {
    const p = readingPrefs.get()
    view.renderer.setAttribute('flow', p.flow)
    view.renderer.setAttribute('gap', MARGINS[p.margin].gap)
    view.renderer.setStyles?.(bookCss(p))
  }
  applyPrefs()
  readingPrefs.addEventListener('change', applyPrefs, { signal })
  await view.init({ lastLocation: opts.onLocation ? opts.lastLocation : loadPos(key), showTextStart: true })

  return {
    view,
    title,
    bookKey: opts.bookId ?? `title:${title}`,
    destroy() {
      ac.abort()
      lookup.hide()
      lookup.onHide = null
      closeSidebar()
      view.close()
      view.remove()
      // Reset the reader chrome so the library screen starts clean.
      prevBtn.hidden = nextBtn.hidden = true
      footer.hidden = true
      tocBtn.disabled = true
      tocNav.replaceChildren()
      locLabel.textContent = ''
      if (cover.src.startsWith('blob:')) URL.revokeObjectURL(cover.src)
    },
  }
}
