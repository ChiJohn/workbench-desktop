import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { api } from './api'

interface Entry {
  term: Terminal
  fit: FitAddon
  opened: boolean
}

const entries = new Map<string, Entry>()

function create(): Entry {
  const term = new Terminal({
    convertEol: true,
    disableStdin: true,
    cursorStyle: 'bar',
    cursorInactiveStyle: 'none',
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
  return { term, fit, opened: false }
}

function get(runId: string): Entry {
  let entry = entries.get(runId)
  if (!entry) {
    entry = create()
    entries.set(runId, entry)
  }
  return entry
}

/** 终端未挂载到 DOM 时也可以写入，挂载后会显示完整内容 */
export function writeTerminal(runId: string, chunk: string): void {
  get(runId).term.write(chunk)
}

export function attachTerminal(runId: string, container: HTMLElement): void {
  const entry = get(runId)
  if (!entry.opened) {
    entry.term.open(container)
    entry.opened = true
  } else if (entry.term.element && entry.term.element.parentElement !== container) {
    container.appendChild(entry.term.element)
  }
  fitTerminal(runId)
}

export function fitTerminal(runId: string): void {
  const entry = entries.get(runId)
  if (!entry?.opened) return
  try {
    entry.fit.fit()
  } catch {
    // 容器不可见时尺寸为 0
  }
}

export function clearTerminal(runId: string): void {
  entries.get(runId)?.term.clear()
}

export function disposeTerminal(runId: string): void {
  entries.get(runId)?.term.dispose()
  entries.delete(runId)
}
