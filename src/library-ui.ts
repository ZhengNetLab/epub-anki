// Library home screen: a grid of saved books with covers and progress.

import { addBook, deleteBook, listBooks, type BookMeta } from './library-db'
import { el } from './dom'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent' })

export interface LibraryUI {
  show(): Promise<void>
  hide(): void
  /** Add files to the library; returns the metadata of each successfully added (or existing) book. */
  addFiles(files: Iterable<File>): Promise<BookMeta[]>
}

export function initLibrary(onOpen: (meta: BookMeta) => void): LibraryUI {
  const root = $('#library')
  const grid = $('#library-grid')
  const empty = $('#library-empty')
  const status = $('#library-status')
  let coverUrls: string[] = []
  let statusTimer: number | undefined

  const setStatus = (text: string, kind: 'info' | 'error' = 'info', sticky = false) => {
    clearTimeout(statusTimer)
    status.textContent = text
    status.className = kind === 'error' ? 'error' : ''
    status.hidden = !text
    if (text && !sticky) statusTimer = window.setTimeout(() => { status.hidden = true }, 5000)
  }

  // ---- delete confirmation ----
  let pendingDelete: BookMeta | null = null
  const dialog = el('dialog', 'confirm-dialog')
  const msg = el('p')
  const cancel = el('button', 'text-btn', '取消')
  const confirm = el('button', 'primary-btn danger-btn', '删除')
  const actions = el('div', 'settings-actions')
  actions.append(el('span', 'spacer'), cancel, confirm)
  dialog.append(msg, actions)
  document.body.append(dialog)
  cancel.addEventListener('click', () => dialog.close())
  confirm.addEventListener('click', async () => {
    dialog.close()
    if (!pendingDelete) return
    await deleteBook(pendingDelete.id)
    setStatus(`已从书库删除《${pendingDelete.title}》`)
    pendingDelete = null
    await render()
  })
  const askDelete = (meta: BookMeta) => {
    pendingDelete = meta
    msg.textContent = `从书库删除《${meta.title}》？已做的卡片不会被删除。`
    dialog.showModal()
  }

  const card = (meta: BookMeta) => {
    const li = el('li', 'book')
    const open = el('button', 'book-open')
    open.title = meta.title
    const cover = el('div', 'book-cover')
    if (meta.cover) {
      const img = el('img')
      const url = URL.createObjectURL(meta.cover)
      coverUrls.push(url)
      img.src = url
      img.alt = ''
      cover.append(img)
    } else {
      cover.classList.add('placeholder')
      cover.append(el('span', undefined, meta.title))
    }
    const p = meta.progress ?? 0
    const bar = el('div', 'book-bar')
    const fill = el('div')
    fill.style.width = `${Math.round(p * 100)}%`
    bar.append(fill)
    if (p > 0) cover.append(bar)
    const label = !meta.lastOpenedAt ? '新书' : p >= 0.995 ? '已读完' : `读到 ${percent.format(p)}`
    open.append(cover, el('div', 'book-title', meta.title), el('div', 'book-author', meta.author || '　'),
      el('div', 'book-progress', label))
    open.addEventListener('click', () => onOpen(meta))

    const more = el('button', 'book-more', '⋯')
    more.title = '更多'
    more.setAttribute('aria-label', `删除《${meta.title}》`)
    more.addEventListener('click', () => askDelete(meta))
    li.append(open, more)
    return li
  }

  async function render() {
    let books: BookMeta[]
    try {
      books = await listBooks()
    } catch (e) {
      setStatus(`无法读取书库：${e instanceof Error ? e.message : e}`, 'error', true)
      books = []
    }
    coverUrls.forEach((u) => URL.revokeObjectURL(u))
    coverUrls = []
    grid.replaceChildren(...books.map(card))
    empty.hidden = books.length > 0
  }

  return {
    async show() {
      root.hidden = false
      await render()
    },
    hide() {
      root.hidden = true
    },
    async addFiles(files) {
      const list = [...files]
      const added: BookMeta[] = []
      const failed: string[] = []
      let dupes = 0
      for (const [i, f] of list.entries()) {
        setStatus(list.length > 1 ? `正在添加（${i + 1}/${list.length}）：${f.name}` : `正在添加：${f.name}`, 'info', true)
        try {
          const { meta, existed } = await addBook(f)
          if (existed) dupes++
          added.push(meta)
        } catch (e) {
          console.error(e)
          failed.push(f.name)
        }
      }
      const parts = []
      if (added.length - dupes) parts.push(`已添加 ${added.length - dupes} 本`)
      if (dupes) parts.push(`${dupes} 本已在书库中`)
      if (failed.length) parts.push(`无法打开：${failed.join('、')}`)
      setStatus(parts.join('；'), failed.length ? 'error' : 'info')
      if (!root.hidden) await render()
      return added
    },
  }
}
