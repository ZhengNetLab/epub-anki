// Minimal type declarations for the parts of foliate-js this app uses.
// Object shapes (book, view, events) live in ./types.ts.

declare module 'foliate-js/view.js' {
  /** Parse a book file without rendering it (returns the foliate-js book object). */
  export function makeBook(file: File | Blob | string): Promise<unknown>
}

declare module 'foliate-js/ui/tree.js' {
  interface TocNode {
    label: string
    href: string
    subitems?: TocNode[]
  }
  export function createTOCView(
    toc: TocNode[],
    onclick: (href: string) => void,
  ): { element: HTMLElement; setCurrentHref(href: string): void }
}
