import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { api } from './api'

interface Entry {
  term: Terminal
  fit: FitAddon
  opened: boolean
  interactive: boolean
}

const entries = new Map<string, Entry>()

function create(interactive: boolean): Entry {
  const term = new Terminal({
    convertEol: !interactive,
    disableStdin: !interactive,
    cursorBlink: interactive,
    cursorStyle: 'bar',
    cursorInactiveStyle: interactive ? 'outline' : 'none',
    scrollback: 5000,
    fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Microsoft YaHei UI", monospace',
    fontSize: 12,
    lineHeight: 1.25,
    theme: {
      background: '#0f1115',
      foreground: '#c9d1d9',
      selectionBackground: '#2b3a55'
    }
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((_event, uri) => void api.app.openExternal(uri)))
  return { term, fit, opened: false, interactive }
}

function get(id: string, interactive = false): Entry {
  let entry = entries.get(id)
  if (!entry) {
    entry = create(interactive)
    entries.set(id, entry)
  }
  return entry
}

/** 交互式终端必须在第一次写入前建好，否则会变成只读日志 */
export function ensureTerminal(id: string, interactive: boolean): void {
  if (!entries.has(id)) entries.set(id, create(interactive))
}

/** 终端未挂载到 DOM 时也可以写入，挂载后会显示完整内容 */
export function writeTerminal(id: string, chunk: string): void {
  get(id).term.write(chunk)
}

export function bindTerminalInput(id: string, onData: (data: string) => void): () => void {
  const entry = get(id, true)
  const sub = entry.term.onData(onData)
  return () => sub.dispose()
}

export function attachTerminal(id: string, container: HTMLElement): void {
  const entry = get(id)
  if (!entry.opened) {
    entry.term.open(container)
    entry.opened = true
  } else if (entry.term.element && entry.term.element.parentElement !== container) {
    container.appendChild(entry.term.element)
  }
  fitTerminal(id)
}

export function fitTerminal(id: string): { cols: number; rows: number } | null {
  const entry = entries.get(id)
  if (!entry?.opened) return null
  try {
    entry.fit.fit()
  } catch {
    // 容器不可见时尺寸为 0
  }
  if (entry.term.cols < 2 || entry.term.rows < 2) return null
  return { cols: entry.term.cols, rows: entry.term.rows }
}

export function focusTerminal(id: string): void {
  entries.get(id)?.term.focus()
}

export function clearTerminal(id: string): void {
  entries.get(id)?.term.clear()
}

export function disposeTerminal(id: string): void {
  entries.get(id)?.term.dispose()
  entries.delete(id)
}
