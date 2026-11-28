// Small DOM helpers shared by the UI modules.

import { formRows, type VerbForms } from './lookup-types'

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** Modal yes/no dialog. Resolves true when the user confirms. */
export function confirmDialog(message: string, confirmLabel: string, danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    const d = el('dialog', 'confirm-dialog')
    const cancel = el('button', 'text-btn', '取消')
    const ok = el('button', danger ? 'primary-btn danger-btn' : 'primary-btn', confirmLabel)
    const actions = el('div', 'settings-actions')
    actions.append(el('span', 'spacer'), cancel, ok)
    d.append(el('p', undefined, message), actions)
    document.body.append(d)
    let result = false
    cancel.addEventListener('click', () => d.close())
    ok.addEventListener('click', () => { result = true; d.close() })
    d.addEventListener('close', () => { d.remove(); resolve(result) })
    d.showModal()
    cancel.focus()
  })
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

/** Irregular verb forms as labelled rows, or null when there are none. */
export function formsList(forms: VerbForms | null | undefined, cls: string): HTMLElement | null {
  const rows = formRows(forms)
  if (!rows.length) return null
  const box = el('div', cls)
  for (const [label, value] of rows) {
    const row = el('div')
    row.append(el('span', 'forms-label', label), value)
    box.append(row)
  }
  return box
}
