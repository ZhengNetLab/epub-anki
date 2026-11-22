// Reading preferences (theme, typography, layout), stored on this device and applied
// to every book. The theme also drives the app chrome via <html data-theme>.

export type ThemeId = 'auto' | 'light' | 'paper' | 'green' | 'night' | 'black'
export type FontId = 'book' | 'serif' | 'sans'
export type MarginId = 'narrow' | 'medium' | 'wide'
export type FlowId = 'paginated' | 'scrolled'

export interface ReadingPrefs {
  theme: ThemeId
  /** Base font size in CSS px. */
  fontSize: number
  font: FontId
  lineHeight: number
  margin: MarginId
  flow: FlowId
  justify: boolean
}

export interface ThemeColors {
  label: string
  bg: string
  fg: string
  link: string
  dark: boolean
}

export const THEMES: Record<Exclude<ThemeId, 'auto'>, ThemeColors> = {
  light: { label: '白色', bg: '#ffffff', fg: '#1f1f1f', link: '#2f6fdb', dark: false },
  paper: { label: '纸张', bg: '#f4ecd8', fg: '#3b3226', link: '#8a5a1f', dark: false },
  green: { label: '护眼', bg: '#cfe6d0', fg: '#1f2d20', link: '#2d6a3e', dark: false },
  night: { label: '夜间', bg: '#1c1c1e', fg: '#c9c9c9', link: '#8fb3ff', dark: true },
  black: { label: '纯黑', bg: '#000000', fg: '#b4b4b4', link: '#7fa6f5', dark: true },
}

export const FONT_SIZE = { min: 12, max: 32, step: 1 }
export const LINE_HEIGHTS: Array<[string, number]> = [['紧凑', 1.35], ['标准', 1.6], ['宽松', 1.85], ['很宽', 2.1]]
export const MARGINS: Record<MarginId, { label: string; gap: string }> = {
  narrow: { label: '窄', gap: '4%' },
  medium: { label: '中', gap: '7%' },
  wide: { label: '宽', gap: '11%' },
}
export const FONTS: Record<FontId, { label: string; stack: string | null }> = {
  book: { label: '原书', stack: null },
  serif: { label: '衬线', stack: '"Noto Serif", "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", Georgia, serif' },
  sans: { label: '无衬线', stack: 'system-ui, "Noto Sans", "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
}

export const DEFAULT_PREFS: ReadingPrefs = {
  theme: 'auto',
  fontSize: 24,
  font: 'book',
  lineHeight: 1.6,
  margin: 'medium',
  flow: 'paginated',
  justify: false,
}

const KEY = 'epub-anki:reading'
/** Bumped when defaults change in a way saved prefs should pick up. */
const VERSION = 2
const darkQuery = matchMedia('(prefers-color-scheme: dark)')

class PrefsStore extends EventTarget {
  #p: ReadingPrefs = { ...DEFAULT_PREFS }

  constructor() {
    super()
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Partial<ReadingPrefs> & { v?: number }
        // v2 raised the default size 18 → 24; a saved 18 was almost always the old default.
        if ((saved.v ?? 1) < 2 && saved.fontSize === 18) saved.fontSize = DEFAULT_PREFS.fontSize
        delete saved.v
        this.#p = { ...DEFAULT_PREFS, ...saved }
      }
    } catch { /* defaults */ }
    // "Follow system" themes must react when the OS switches light/dark.
    darkQuery.addEventListener('change', () => {
      if (this.#p.theme === 'auto') this.dispatchEvent(new Event('change'))
    })
  }

  get(): Readonly<ReadingPrefs> {
    return this.#p
  }

  set(patch: Partial<ReadingPrefs>) {
    this.#p = { ...this.#p, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...this.#p, v: VERSION }))
    } catch { /* not persisted */ }
    this.dispatchEvent(new Event('change'))
  }

  /** The concrete theme in effect ("auto" resolved against the OS setting). */
  activeTheme(): Exclude<ThemeId, 'auto'> {
    const t = this.#p.theme
    return t === 'auto' ? (darkQuery.matches ? 'night' : 'light') : t
  }
}

export const readingPrefs = new PrefsStore()

/** Apply the active theme to the app chrome and the Android status bar colour. */
export function applyAppTheme() {
  const id = readingPrefs.activeTheme()
  document.documentElement.dataset.theme = id
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[id].bg)
}

/** Appended to our selectors to outrank book styles: an ID selector that never matches
 *  adds ID-level specificity, so our !important rules beat the book's class-based
 *  !important rules (common in Calibre conversions). Inline !important still wins. */
const B = ':not(#__epub_anki__)'

/** CSS injected into each book section. Page background stays transparent: the theme
 *  colour is painted behind the iframe, because foliate-js only samples a section's
 *  background when it loads and would otherwise show stale colours after a theme switch. */
export function bookCss(p: ReadingPrefs = readingPrefs.get()): string {
  const t = THEMES[readingPrefs.activeTheme()]
  const font = FONTS[p.font].stack
  // Typography applies to every element, not just <p>: many EPUBs (notably Chinese ones)
  // use <div> paragraphs and set line-height on spans.
  const all = `html body${B}, html body *${B}:not(svg *)`
  return `
  @namespace epub "http://www.idpf.org/2007/ops";
  html {
    color-scheme: ${t.dark ? 'dark' : 'light'};
    font-size: ${p.fontSize}px !important;
    color: ${t.fg} !important;
    background: transparent !important;
  }
  /* Body text follows the chosen size even if the book fixes it in px/pt. */
  html body${B} { font-size: 1rem !important; background: transparent !important; }
  /* Books often hard-code black text or white boxes; follow the theme instead. */
  html body *${B}:not(img):not(svg):not(svg *):not(video) {
    color: inherit !important;
    background-color: transparent !important;
  }
  html a${B}:link, html a${B}:visited { color: ${t.link} !important; }
  ${all} { line-height: ${p.lineHeight} !important; }
  ${font ? `html body${B}, html body *${B}:not(code):not(pre):not(kbd):not(samp):not(svg *) { font-family: ${font} !important; }` : ''}
  p, li, blockquote, dd {
    hanging-punctuation: allow-end last;
    widows: 2;
  }
  ${p.justify ? `html :is(p, li, blockquote, dd)${B} { text-align: justify !important; -webkit-hyphens: auto; hyphens: auto; }` : ''}
  [align="left"] { text-align: left; }
  [align="right"] { text-align: right; }
  [align="center"] { text-align: center; }
  [align="justify"] { text-align: justify; }
  pre { white-space: pre-wrap !important; }
  ${t.dark ? 'img, svg image, video { filter: brightness(0.85); }' : ''}
  aside[epub|type~="endnote"], aside[epub|type~="footnote"],
  aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
`
}
