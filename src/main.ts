import './style.css'
import { openBook, type Reader } from './reader'
import { initCardsUI } from './cards-ui'
import { openSettings } from './settings-ui'
import { settings } from './settings'
import { initLibrary } from './library-ui'
import { getFile, markOpened, saveProgress, type BookMeta } from './library-db'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => {
  const el = document.querySelector<T>(sel)
  if (!el) throw new Error(`Missing element ${sel}`)
  return el
}

initCardsUI()
$('#settings-button').addEventListener('click', openSettings)

const keyBanner = $('#key-banner')
const syncKeyBanner = () => { keyBanner.hidden = settings.config() !== null }
settings.addEventListener('change', syncKeyBanner)
syncKeyBanner()

const fileInput = $<HTMLInputElement>('#file-input')
const addButton = $('#open-button')
const backButton = $('#back-button')
const tocButton = $('#toc-button')
const titleEl = $('#book-title')
const libraryEl = $('#library')
const main = $('#main')

let reader: Reader | null = null

const library = initLibrary((meta) => void openFromLibrary(meta))

/** Show the library (home) screen. */
async function showLibrary() {
  reader?.destroy()
  reader = null
  document.title = 'EPUB 阅读器'
  titleEl.textContent = '书库'
  backButton.hidden = tocButton.hidden = true
  addButton.hidden = false
  await library.show()
}

function enterReader() {
  library.hide()
  backButton.hidden = tocButton.hidden = false
  addButton.hidden = true
  // Let the phone's back gesture return to the library instead of leaving the app.
  if (!history.state?.reader) history.pushState({ reader: true }, '')
}

function showError(text: string) {
  const s = $('#library-status')
  s.textContent = text
  s.className = 'error'
  s.hidden = false
}

async function openFile(file: File | string, opts?: Parameters<typeof openBook>[1]) {
  reader?.destroy()
  reader = null
  enterReader()
  try {
    reader = await openBook(file, opts)
  } catch (e) {
    console.error(e)
    await closeReader()
    showError(`无法打开这本书：${e instanceof Error ? e.message : String(e)}`)
  }
}

async function openFromLibrary(meta: BookMeta) {
  let file: File
  try {
    file = await getFile(meta)
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e))
    return
  }
  void markOpened(meta.id)
  await openFile(file, {
    lastLocation: meta.cfi,
    onLocation: (cfi, fraction) => void saveProgress(meta.id, cfi, fraction),
  })
}

/** Leave the reader: pop our history entry if we pushed one, else go home directly. */
async function closeReader() {
  if (history.state?.reader) history.back() // → popstate → showLibrary()
  else await showLibrary()
}

window.addEventListener('popstate', () => {
  if (libraryEl.hidden) void showLibrary()
})
backButton.addEventListener('click', () => void closeReader())

// ---- adding books ----
addButton.addEventListener('click', () => fileInput.click())
$('#library-add').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
  const files = [...(fileInput.files ?? [])]
  fileInput.value = ''
  if (files.length) await library.addFiles(files)
})

// Desktop: drop files anywhere to add them; a single file is opened right away.
main.addEventListener('dragover', (e) => e.preventDefault())
main.addEventListener('drop', async (e) => {
  e.preventDefault()
  const files = [...(e.dataTransfer?.files ?? [])]
  if (!files.length) return
  const added = await library.addFiles(files)
  if (files.length === 1 && added[0]) await openFromLibrary(added[0])
})

// Start on the library. Dev convenience: /?book=/books/sample.epub opens a URL directly.
history.replaceState(null, '')
void (async () => {
  await showLibrary()
  const bookParam = new URLSearchParams(location.search).get('book')
  if (bookParam) await openFile(bookParam)
})()
