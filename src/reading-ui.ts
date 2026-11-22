// "Aa" reading settings panel: theme / paper colour, font size, typeface, line spacing,
// margins, page-turn style, justification. Changes apply live.

import {
  DEFAULT_PREFS, FONT_SIZE, FONTS, LINE_HEIGHTS, MARGINS, THEMES, readingPrefs,
  type FlowId, type FontId, type MarginId, type ReadingPrefs, type ThemeId,
} from './reading-prefs'
import { el } from './dom'

export interface ReadingUI {
  open(): void
  close(): void
}

/** A row of mutually exclusive buttons bound to one preference. */
function segmented<T extends string | number>(
  options: Array<[label: string, value: T]>,
  current: () => T,
  onPick: (v: T) => void,
) {
  const wrap = el('div', 'seg')
  const buttons = options.map(([label, value]) => {
    const b = el('button', undefined, label)
    b.type = 'button'
    b.addEventListener('click', () => onPick(value))
    wrap.append(b)
    return { b, value }
  })
  const sync = () => buttons.forEach(({ b, value }) => b.setAttribute('aria-pressed', String(value === current())))
  return { wrap, sync }
}

export function initReadingUI(): ReadingUI {
  const button = document.querySelector<HTMLElement>('#reading-button')!
  const backdrop = el('div', 'reading-backdrop')
  const panel = el('div', 'reading-panel')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '阅读设置')
  backdrop.hidden = panel.hidden = true
  document.body.append(backdrop, panel)

  const p = () => readingPrefs.get()
  const set = (patch: Partial<ReadingPrefs>) => readingPrefs.set(patch)

  // ---- theme swatches ----
  const themeRow = el('div', 'swatches')
  const themeIds: ThemeId[] = ['auto', 'light', 'paper', 'green', 'night', 'black']
  const swatches = themeIds.map((id) => {
    const b = el('button', 'swatch')
    b.type = 'button'
    const dot = el('span', 'swatch-dot')
    if (id === 'auto') {
      dot.style.background = `linear-gradient(135deg, ${THEMES.light.bg} 50%, ${THEMES.night.bg} 50%)`
      dot.style.color = THEMES.light.fg
    } else {
      dot.style.background = THEMES[id].bg
      dot.style.color = THEMES[id].fg
    }
    dot.textContent = id === 'auto' ? '' : '文'
    b.append(dot, el('span', 'swatch-label', id === 'auto' ? '跟随系统' : THEMES[id].label))
    b.addEventListener('click', () => set({ theme: id }))
    themeRow.append(b)
    return { b, id }
  })

  // ---- font size stepper ----
  const minus = el('button', 'step-btn', 'A−')
  const plus = el('button', 'step-btn big', 'A+')
  minus.type = plus.type = 'button'
  const sizeLabel = el('span', 'step-value')
  const stepper = el('div', 'stepper')
  stepper.append(minus, sizeLabel, plus)
  const bump = (d: number) =>
    set({ fontSize: Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, p().fontSize + d * FONT_SIZE.step)) })
  minus.addEventListener('click', () => bump(-1))
  plus.addEventListener('click', () => bump(1))

  const font = segmented(
    Object.entries(FONTS).map(([id, f]) => [f.label, id as FontId]),
    () => p().font, (v) => set({ font: v }))
  const line = segmented(LINE_HEIGHTS, () => p().lineHeight, (v) => set({ lineHeight: v }))
  const margin = segmented(
    Object.entries(MARGINS).map(([id, m]) => [m.label, id as MarginId]),
    () => p().margin, (v) => set({ margin: v }))
  const flow = segmented<FlowId>([['左右翻页', 'paginated'], ['上下滚动', 'scrolled']],
    () => p().flow, (v) => set({ flow: v }))

  const justify = el('input')
  justify.type = 'checkbox'
  justify.addEventListener('change', () => set({ justify: justify.checked }))
  const justifyLabel = el('label', 'switch')
  justifyLabel.append(justify, el('span', 'switch-track'))

  const row = (label: string, control: HTMLElement) => {
    const r = el('div', 'reading-row')
    r.append(el('span', 'reading-label', label), control)
    return r
  }

  const head = el('div', 'reading-head')
  const close = el('button', 'lookup-close', '×')
  close.title = '关闭'
  head.append(el('span', undefined, '阅读设置'), close)

  const reset = el('button', 'text-btn', '恢复默认')
  reset.type = 'button'
  reset.addEventListener('click', () => set({ ...DEFAULT_PREFS }))
  const foot = el('div', 'reading-foot')
  foot.append(reset)

  panel.append(head, themeRow,
    row('字号', stepper), row('字体', font.wrap), row('行距', line.wrap),
    row('页边距', margin.wrap), row('翻页', flow.wrap), row('两端对齐', justifyLabel), foot)

  const sync = () => {
    const cur = p()
    swatches.forEach(({ b, id }) => b.setAttribute('aria-pressed', String(id === cur.theme)))
    sizeLabel.textContent = String(cur.fontSize)
    minus.disabled = cur.fontSize <= FONT_SIZE.min
    plus.disabled = cur.fontSize >= FONT_SIZE.max
    font.sync(); line.sync(); margin.sync(); flow.sync()
    justify.checked = cur.justify
  }
  readingPrefs.addEventListener('change', sync)
  sync()

  const ui: ReadingUI = {
    open() {
      sync()
      backdrop.hidden = panel.hidden = false
      button.setAttribute('aria-expanded', 'true')
    },
    close() {
      backdrop.hidden = panel.hidden = true
      button.setAttribute('aria-expanded', 'false')
    },
  }
  button.addEventListener('click', () => (panel.hidden ? ui.open() : ui.close()))
  close.addEventListener('click', () => ui.close())
  // Transparent backdrop: the book stays visible for live preview; tapping it just closes.
  backdrop.addEventListener('click', () => ui.close())
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ui.close() })
  return ui
}
