// Settings dialog: AI provider, API key and model. Values stay on this device.

import { settings, type DeckMode, type Settings } from './settings'
import { PROVIDERS, type ProviderName } from './providers'
import { lookup } from './ai'
import { el } from './dom'

let dialog: HTMLDialogElement | null = null

function build(): HTMLDialogElement {
  const d = el('dialog', 'settings-dialog')
  const form = el('form')
  form.method = 'dialog'

  const head = el('div', 'settings-head')
  head.append(el('h2', undefined, '设置'))

  const providerSel = el('select')
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const o = el('option', undefined, p.label)
    o.value = id
    providerSel.append(o)
  }

  const keyInput = el('input')
  keyInput.type = 'password'
  keyInput.autocomplete = 'off'
  keyInput.spellcheck = false
  keyInput.placeholder = 'sk-...'
  const showKey = el('button', 'text-btn', '显示')
  showKey.type = 'button'
  showKey.addEventListener('click', () => {
    const hidden = keyInput.type === 'password'
    keyInput.type = hidden ? 'text' : 'password'
    showKey.textContent = hidden ? '隐藏' : '显示'
  })
  const keyRow = el('div', 'settings-inline')
  keyRow.append(keyInput, showKey)
  const keyLink = el('a', 'settings-link', '去哪里获取 API key？')
  keyLink.target = '_blank'
  keyLink.rel = 'noopener'

  const modelInput = el('input')
  modelInput.spellcheck = false
  modelInput.setAttribute('list', 'model-options')
  const modelList = el('datalist')
  modelList.id = 'model-options'

  const row = (label: string, ...children: Node[]) => {
    const l = el('label', 'settings-row')
    l.append(el('span', undefined, label), ...children)
    return l
  }

  const status = el('div', 'settings-status')
  const auto = el('input')
  auto.type = 'checkbox'
  const autoRow = el('label', 'settings-check')
  const autoText = el('span')
  autoText.append('选词后自动查词', el('small', undefined, '关闭时，选词后先显示「查词」按钮，点一下才查（不会误查、更省额度）'))
  autoRow.append(auto, autoText)

  // Anki deck on export
  const deckSel = el('select')
  for (const [value, label] of [['per-book', '每本书自动一个牌组（Otto生词::书名）'], ['choose', '导入时在 Anki 里自己选牌组']]) {
    const o = el('option', undefined, label)
    o.value = value
    deckSel.append(o)
  }

  const hint = el('p', 'settings-hint', 'API key 只保存在这台设备的浏览器里，查词时直接发送给所选的 AI 服务。')

  const test = el('button', 'text-btn', '测试')
  test.type = 'button'
  const cancel = el('button', 'text-btn', '取消')
  cancel.type = 'button'
  const save = el('button', 'primary-btn', '保存')
  save.type = 'submit'
  const actions = el('div', 'settings-actions')
  actions.append(test, el('span', 'spacer'), cancel, save)

  form.append(head, row('AI 服务', providerSel), row('API key', keyRow), keyLink,
    row('模型', modelInput, modelList), autoRow, row('导出到 Anki 的牌组', deckSel), hint, status, actions)
  d.append(form)

  // Draft edits per provider so switching the dropdown doesn't lose typed keys.
  let draft: Settings
  const current = () => providerSel.value as ProviderName
  const showProvider = () => {
    const p = PROVIDERS[current()]
    keyInput.value = draft.keys[current()] ?? ''
    modelInput.value = draft.models[current()] ?? ''
    modelInput.placeholder = `默认 ${p.defaultModel}`
    modelList.replaceChildren(...p.models.map((m) => Object.assign(el('option'), { value: m })))
    keyLink.href = p.keyUrl
    status.textContent = ''
  }
  const capture = () => {
    draft.keys[current()] = keyInput.value.trim()
    draft.models[current()] = modelInput.value.trim()
  }

  providerSel.addEventListener('focus', capture)
  providerSel.addEventListener('change', showProvider)
  test.addEventListener('click', async () => {
    capture()
    const provider = current()
    const apiKey = draft.keys[provider]
    if (!apiKey) {
      status.className = 'settings-status error'
      status.textContent = '请先填写 API key'
      return
    }
    status.className = 'settings-status'
    status.textContent = '测试中…'
    test.disabled = true
    const t0 = performance.now()
    try {
      const r = await lookup({ word: 'serendipity', sentence: 'Finding that book was pure serendipity.', lang: 'en' },
        { provider, apiKey, model: draft.models[provider] || PROVIDERS[provider].defaultModel })
      status.className = 'settings-status ok'
      status.textContent = `✓ 可用（${((performance.now() - t0) / 1000).toFixed(1)} 秒）：serendipity → ${r.meaning}`
    } catch (e) {
      status.className = 'settings-status error'
      status.textContent = e instanceof Error ? e.message : String(e)
    } finally {
      test.disabled = false
    }
  })
  cancel.addEventListener('click', () => d.close())
  form.addEventListener('submit', () => {
    capture()
    settings.set({ ...draft, provider: current(), autoLookup: auto.checked, deckMode: deckSel.value as DeckMode })
  })
  d.addEventListener('settings-open', () => {
    const s = settings.get()
    draft = { provider: s.provider, keys: { ...s.keys }, models: { ...s.models }, autoLookup: s.autoLookup, deckMode: s.deckMode }
    auto.checked = s.autoLookup
    deckSel.value = s.deckMode
    providerSel.value = s.provider
    showProvider()
  })
  document.body.append(d)
  return d
}

export function openSettings() {
  dialog ??= build()
  dialog.dispatchEvent(new Event('settings-open'))
  dialog.showModal()
}
