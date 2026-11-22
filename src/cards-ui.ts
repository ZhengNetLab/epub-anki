// Right-hand drawer listing saved cards, with inline edit, delete and undo.

import { cards, type Card } from './cards'
import { el, highlighted } from './dom'
import { buildAnkiTsv, downloadText, exportFilename } from './export'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!

export function initCardsUI() {
  const button = $('#cards-button')
  const count = $('#cards-count')
  const drawer = $('#cards-drawer')
  const dim = $('#cards-dim')
  const list = $('#cards-list')
  const title = $('#cards-title')
  const warning = $('#cards-warning')
  const toast = $('#cards-toast')
  const exportBtn = $<HTMLButtonElement>('#cards-export')

  /** Card currently being edited (only one at a time). */
  let editing: string | null = null
  let toastTimer: number | undefined

  const open = () => {
    drawer.classList.add('show')
    drawer.ariaHidden = 'false'
    dim.hidden = false
  }
  const close = () => {
    drawer.classList.remove('show')
    drawer.ariaHidden = 'true'
    dim.hidden = true
    editing = null
    render()
  }
  button.addEventListener('click', open)
  dim.addEventListener('click', close)
  $('#cards-close').addEventListener('click', close)
  exportBtn.addEventListener('click', () => {
    if (cards.size) downloadText(exportFilename(), buildAnkiTsv(cards.list()))
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('show') && !editing) close()
  })

  const showUndo = (word: string, undo: () => void) => {
    clearTimeout(toastTimer)
    const btn = el('button', 'link-btn', '撤销')
    btn.addEventListener('click', () => {
      undo()
      toast.hidden = true
    })
    toast.replaceChildren(`已删除「${word}」`, btn)
    toast.hidden = false
    toastTimer = window.setTimeout(() => { toast.hidden = true }, 6000)
  }

  const viewItem = (c: Card) => {
    const li = el('li', 'card-item')
    const front = el('div', 'card-front')
    front.append(el('span', 'card-word', c.word))
    const meta = [c.phonetic, c.pos].filter(Boolean).join('  ')
    if (meta) front.append(el('span', 'card-meta', meta))
    li.append(front, el('div', 'card-meaning', c.meaning))
    if (c.note) li.append(el('div', 'card-note', c.note))
    if (c.sentence) {
      const p = el('p', 'card-sentence')
      p.append(highlighted(c.sentence, c.word, c.offset))
      li.append(p)
    }
    const foot = el('div', 'card-foot')
    foot.append(el('span', 'card-book', c.book))
    const edit = el('button', 'link-btn', '编辑')
    edit.addEventListener('click', () => {
      editing = c.id
      render()
    })
    const del = el('button', 'link-btn danger', '删除')
    del.addEventListener('click', () => {
      const removed = cards.remove(c.id)
      if (removed) showUndo(c.word, () => cards.restore(removed))
    })
    foot.append(edit, del)
    li.append(foot)
    return li
  }

  const field = (label: string, value: string, multiline: boolean) => {
    const wrap = el('label', 'card-field')
    wrap.append(el('span', undefined, label))
    const input = multiline ? el('textarea') : el('input')
    input.value = value
    if (input instanceof HTMLTextAreaElement) input.rows = 2
    wrap.append(input)
    return { wrap, input }
  }

  const editItem = (c: Card) => {
    const li = el('li', 'card-item editing')
    const form = el('form')
    const word = field('正面', c.word, false)
    const meaning = field('释义', c.meaning, true)
    const note = field('补充说明', c.note, true)
    const save = el('button', 'primary-btn', '保存')
    save.type = 'submit'
    const cancel = el('button', 'text-btn', '取消')
    cancel.type = 'button'
    const actions = el('div', 'card-edit-actions')
    actions.append(cancel, save)
    form.append(word.wrap, meaning.wrap, note.wrap, actions)
    li.append(form)

    const done = () => {
      editing = null
      render()
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const w = word.input.value.trim()
      if (!w) {
        word.input.focus()
        return
      }
      editing = null
      cards.update(c.id, { word: w, meaning: meaning.input.value.trim(), note: note.input.value.trim() })
    })
    cancel.addEventListener('click', done)
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        done()
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        form.requestSubmit()
      }
    })
    requestAnimationFrame(() => word.input.focus())
    return li
  }

  function render() {
    const all = cards.list()
    count.textContent = String(all.length)
    count.hidden = all.length === 0
    title.textContent = `卡片（${all.length}）`
    exportBtn.disabled = all.length === 0
    warning.hidden = cards.persistent
    if (!all.length) {
      list.replaceChildren(el('li', 'cards-empty', '还没有卡片。查词后点「加入卡片」。'))
      return
    }
    list.replaceChildren(...all.map((c) => (c.id === editing ? editItem(c) : viewItem(c))))
  }

  cards.addEventListener('change', render)
  render()
}
