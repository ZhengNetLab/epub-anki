import './style.css'
import { openBook, type Reader } from './reader'
import { initCardsUI } from './cards-ui'
import { openSettings } from './settings-ui'
import { settings } from './settings'

initCardsUI()

const keyHint = document.querySelector<HTMLElement>('#welcome-key-hint')!
const syncKeyHint = () => { keyHint.hidden = settings.config() !== null }
settings.addEventListener('change', syncKeyHint)
syncKeyHint()
document.querySelector('#settings-button')!.addEventListener('click', openSettings)

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => {
  const el = document.querySelector<T>(sel)
  if (!el) throw new Error(`Missing element ${sel}`)
  return el
}

const fileInput = $<HTMLInputElement>('#file-input')
const main = $('#main')
const welcome = $('#welcome')
const errorBox = document.createElement('p')
errorBox.className = 'error'

let reader: Reader | null = null

async function load(file: File | string) {
  errorBox.remove()
  try {
    reader?.destroy()
    reader = await openBook(file)
    welcome.hidden = true
  } catch (e) {
    console.error(e)
    reader = null
    welcome.hidden = false
    errorBox.textContent = `无法打开这个文件：${e instanceof Error ? e.message : String(e)}`
    welcome.append(errorBox)
  }
}

$('#open-button').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void load(file)
  fileInput.value = ''
})

main.addEventListener('dragover', (e) => e.preventDefault())
main.addEventListener('drop', (e) => {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file) void load(file)
})

// Dev convenience: open a book by URL, e.g. /?book=/books/sample.epub
const bookParam = new URLSearchParams(location.search).get('book')
if (bookParam) void load(bookParam)
