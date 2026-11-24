// The library: EPUB files and their metadata kept on this device in IndexedDB, so books
// can be reopened from the home screen without picking the file again.
// Metadata and file bytes live in separate stores so listing the library stays cheap.
// Binary data is stored as ArrayBuffer, not Blob/File: WebKit (iPhone Safari) has a history
// of failing to store Blobs in IndexedDB (the transaction errors with a null error), while
// ArrayBuffers work everywhere. Records written as Blobs by earlier versions are still read.

import { makeBook } from 'foliate-js/view.js'
import type { Book } from './types'
import { formatContributor, formatLang } from './book-meta'

export interface BookMeta {
  /** SHA-256 of the file (so adding the same file twice is a no-op). */
  id: string
  title: string
  author: string
  fileName: string
  size: number
  addedAt: number
  lastOpenedAt?: number
  /** Cover image bytes and MIME type. */
  coverData?: ArrayBuffer
  coverType?: string
  /** Cover as a Blob (records from versions before ArrayBuffer storage). */
  cover?: Blob
  /** Last reading position (EPUB CFI) and overall progress 0..1. */
  cfi?: string
  progress?: number
}

const DB_NAME = 'epub-anki'
const BOOKS = 'books'
const FILES = 'files'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(BOOKS)) d.createObjectStore(BOOKS, { keyPath: 'id' })
      if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const committed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('保存到本机存储失败'))
    tx.onabort = () => reject(tx.error ?? new Error('保存到本机存储失败'))
  })

/** The book's cover image, whichever format it was stored in. */
export function coverBlob(meta: BookMeta): Blob | undefined {
  if (meta.coverData) return new Blob([meta.coverData], { type: meta.coverType || 'image/jpeg' })
  return meta.cover
}

/** Books, most recently opened (or added) first. */
export async function listBooks(): Promise<BookMeta[]> {
  const d = await db()
  const all = await done(d.transaction(BOOKS).objectStore(BOOKS).getAll() as IDBRequest<BookMeta[]>)
  return all.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))
}

export async function getBook(id: string): Promise<BookMeta | undefined> {
  const d = await db()
  return done(d.transaction(BOOKS).objectStore(BOOKS).get(id) as IDBRequest<BookMeta | undefined>)
}

export async function getFile(meta: BookMeta): Promise<File> {
  const d = await db()
  const data = await done(d.transaction(FILES).objectStore(FILES).get(meta.id) as IDBRequest<ArrayBuffer | Blob | undefined>)
  if (!data) throw new Error('这本书的文件不见了，请重新添加')
  return new File([data], meta.fileName, { type: 'application/epub+zip' })
}

async function fileId(file: File, bytes: ArrayBuffer): Promise<string> {
  if (crypto.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // crypto.subtle needs HTTPS; plain-http LAN testing falls back to a name/size key.
  return `${file.name}:${file.size}:${file.lastModified}`
}

/** Add a book file. Returns its metadata and whether it was already in the library. */
export async function addBook(file: File): Promise<{ meta: BookMeta; existed: boolean }> {
  const bytes = await file.arrayBuffer()
  const id = await fileId(file, bytes)
  const existing = await getBook(id)
  if (existing) return { meta: existing, existed: true }

  const book = (await makeBook(file)) as Book
  let cover: Blob | undefined
  try {
    cover = (await book.getCover?.()) ?? undefined
  } catch { /* no cover */ }
  const coverData = cover ? await cover.arrayBuffer() : undefined
  const meta: BookMeta = {
    id,
    title: formatLang(book.metadata?.title) || file.name.replace(/\.epub$/i, ''),
    author: formatContributor(book.metadata?.author),
    fileName: file.name,
    size: file.size,
    addedAt: Date.now(),
    coverData,
    coverType: cover?.type,
  }
  const d = await db()
  const tx = d.transaction([BOOKS, FILES], 'readwrite')
  tx.objectStore(FILES).put(bytes, id)
  tx.objectStore(BOOKS).put(meta)
  await committed(tx)
  // Ask the browser not to evict the library under storage pressure (installed PWAs usually get this).
  void navigator.storage?.persist?.().catch(() => {})
  return { meta, existed: false }
}

async function patch(id: string, fields: Partial<BookMeta>) {
  const d = await db()
  const tx = d.transaction(BOOKS, 'readwrite')
  const store = tx.objectStore(BOOKS)
  const meta = await done(store.get(id) as IDBRequest<BookMeta | undefined>)
  if (meta) store.put({ ...meta, ...fields })
  await committed(tx)
}

export const markOpened = (id: string) => patch(id, { lastOpenedAt: Date.now() })

export const saveProgress = (id: string, cfi: string, progress: number) =>
  patch(id, { cfi, progress, lastOpenedAt: Date.now() })

export async function deleteBook(id: string) {
  const d = await db()
  const tx = d.transaction([BOOKS, FILES], 'readwrite')
  tx.objectStore(BOOKS).delete(id)
  tx.objectStore(FILES).delete(id)
  await committed(tx)
}
