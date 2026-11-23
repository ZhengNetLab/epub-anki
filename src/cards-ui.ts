// Right-hand drawer listing saved cards, with inline edit, delete and undo.
// While a book is open it shows only that book's cards and exports them to the book's
// own Anki deck; in the library it shows every card grouped by book.

import { cards, type Card, type CardGroup } from './cards'
import { confirmDialog, el, highlighted } from './dom'
import { buildAnkiTsv, deckName, downloadText, exportFilename } from './export'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!

export interface CardsScope {
  /** bookKey() of the open book. */
  key: string
  title: string
}

export interface CardsUI {
  /** Show one book's cards (reading), or null for all cards grouped by book (library). */
  setScope(scope: CardsScope | null): void
}

export function initCardsUI(): CardsUI {
  const button = $('#cards-button')
  const count = $('#cards-count')
  const drawer = $('#cards-drawer')
  const dim = $('#cards-dim')
  const list = $('#cards-list')
  const title = $('#cards-title')
  const deckLine = $('#cards-deck')
  const warning = $('#cards-warning')
  const toast = $('#cards-toast')
  const exportBtn = $<HTMLButtonElement>('#cards-export')
  const clearBtn = $<HTMLButtonElement>('#cards-clear')

  let scope: CardsScope | null = null
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

  const exportCards = (list: readonly Card[], bookTitle?: string) => {
    if (list.length) downloadText(exportFilename(bookTitle), buildAnkiTsv(list))
  }
  exportBtn.addEventListener('click', () => {
    if (scope) exportCards(cards.forBook(scope.key), scope.title)
    else exportCards(cards.list())
  })
  clearBtn.addEventListener('click', async () => {
    const n = scope ? cards.forBook(scope.key).length : cards.size
    if (!n) return
    const message = scope
      ? `清空《${scope.title}》的 ${n} 张卡片？还没导出的卡片会丢失。`
      : `清空全部 ${n} 张卡片（所有书）？还没导出的卡片会丢失。`
    if (!(await confirmDialog(message, '清空'))) return
    editing = null
    const snapshot = cards.clear(scope ? scope.key : null)
    showUndo(`已清空 ${n} 张卡片`, () => cards.restoreAll(snapshot))
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('show') && !editing && !document.querySelector('dialog[open]')) close()
  })

  const showUndo = (message: string, undo: () => void) => {
    clearTimeout(toastTimer)
    const btn = el('button', 'link-btn', '撤销')
    btn.addEventListener('click', () => {
      undo()
      toast.hidden = true
    })
    toast.replaceChildren(message, btn)
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
    foot.append(el('span', 'spacer'))
    const edit = el('button', 'link-btn', '编辑')
    edit.addEventListener('click', () => {
      editing = c.id
      render()
    })
    const del = el('button', 'link-btn danger', '删除')
    del.addEventListener('click', () => {
      const removed = cards.remove(c.id)
      if (removed) showUndo(`已删除「${c.word}」`, () => cards.restore(removed))
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

  const item = (c: Card) => (c.id === editing ? editItem(c) : viewItem(c))

  /** Library view: a header per book with its count, deck and its own export button. */
  const groupHeader = (g: CardGroup) => {
    const li = el('li', 'card-group')
    const text = el('div', 'card-group-text')
    text.append(el('div', 'card-group-title', `${g.title}（${g.cards.length}）`),
      el('div', 'card-group-deck', `牌组：${deckName(g.title)}`))
    const exp = el('button', 'text-btn', '导出')
    exp.title = `只导出《${g.title}》的卡片`
    exp.addEventListener('click', () => exportCards(g.cards, g.title))
    li.append(text, exp)
    return li
  }

  function render() {
    warning.hidden = cards.persistent
    if (scope) {
      const mine = cards.forBook(scope.key)
      count.textContent = String(mine.length)
      count.hidden = mine.length === 0
      title.textContent = `本书卡片（${mine.length}）`
      exportBtn.textContent = '导出到 Anki'
      exportBtn.disabled = clearBtn.disabled = mine.length === 0
      clearBtn.title = '删除本书的所有卡片'
      deckLine.textContent = `导出到牌组：${deckName(scope.title)}`
      deckLine.hidden = false
      list.replaceChildren(...(mine.length
        ? mine.map(item)
        : [el('li', 'cards-empty', '这本书还没有卡片。选中词语查词后点「加入卡片」。')]))
      return
    }
    const groups = cards.groups()
    const total = cards.size
    count.textContent = String(total)
    count.hidden = total === 0
    title.textContent = `全部卡片（${total}）`
    exportBtn.textContent = '全部导出'
    exportBtn.disabled = clearBtn.disabled = total === 0
    clearBtn.title = '删除所有书的全部卡片'
    deckLine.textContent = '每本书导出到各自的牌组（EPUB生词::书名）'
    deckLine.hidden = groups.length === 0
    list.replaceChildren(...(groups.length
      ? groups.flatMap((g) => [groupHeader(g), ...g.cards.map(item)])
      : [el('li', 'cards-empty', '还没有卡片。打开一本书，选中词语查词后点「加入卡片」。')]))
  }

  cards.addEventListener('change', render)
  render()

  return {
    setScope(next) {
      scope = next
      editing = null
      render()
    },
  }
}
