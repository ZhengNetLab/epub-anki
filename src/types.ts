// Shapes of foliate-js objects, declared only as far as this app needs them.

export interface TocItem {
  label: string
  href: string
  subitems?: TocItem[]
}

export type LanguageMap = string | Record<string, string>
export type Contributor = string | { name: LanguageMap } | Array<string | { name: LanguageMap }>

export interface Book {
  dir?: string
  toc?: TocItem[]
  metadata?: {
    title?: LanguageMap
    author?: Contributor
    language?: string | string[]
  }
  getCover?(): Promise<Blob | null> | Blob | null
}

export interface RelocateDetail {
  fraction: number
  location?: { current: number; next: number; total: number }
  tocItem?: { label?: string; href?: string }
  pageItem?: { label?: string }
  cfi: string
}

export interface LoadDetail {
  doc: Document
  index: number
}

export interface Renderer extends HTMLElement {
  setStyles?(css: string): void
  next(): Promise<void>
}

export interface FoliateView extends HTMLElement {
  book: Book
  renderer: Renderer
  open(file: File | Blob | string): Promise<void>
  close(): void
  init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
  goTo(target: string | number): Promise<void>
  goToFraction(frac: number): Promise<void>
  getSectionFractions(): number[]
  prev(): Promise<void>
  next(): Promise<void>
  goLeft(): Promise<void>
  goRight(): Promise<void>
}
