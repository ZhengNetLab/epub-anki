// Small DOM helpers shared by the UI modules.

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** Index of the occurrence of `word` in `sentence` nearest `hint` (case-insensitive), or -1. */
export function findNear(sentence: string, word: string, hint: number): number {
  const hay = sentence.toLowerCase()
  const needle = word.toLowerCase()
  let i = -1
  if (!needle) return i
  for (let j = hay.indexOf(needle); j >= 0; j = hay.indexOf(needle, j + 1))
    if (i < 0 || Math.abs(j - hint) < Math.abs(i - hint)) i = j
  return i
}

/** Render `sentence` with the occurrence of `word` nearest `hint` wrapped in <mark>. */
export function highlighted(sentence: string, word: string, hint: number): DocumentFragment {
  const frag = document.createDocumentFragment()
  const i = findNear(sentence, word, hint)
  if (i < 0) {
    frag.append(sentence)
    return frag
  }
  frag.append(sentence.slice(0, i), el('mark', undefined, sentence.slice(i, i + word.length)),
    sentence.slice(i + word.length))
  return frag
}
