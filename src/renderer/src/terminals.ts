import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { api } from './api'

interface Entry {
  term: Terminal
  fit: FitAddon
  opened: boolean
  interactive: boolean
  onInput?: (data: string) => void
  searchQuery: string
  searchIndex: number
}

const entries = new Map<string, Entry>()
let onSearchRequest: (() => void) | null = null

export function setTerminalSearchHandler(cb: (() => void) | null): void {
  onSearchRequest = cb
}

function applyInteractive(entry: Entry, interactive: boolean): void {
  if (entry.interactive === interactive) return
  entry.interactive = interactive
  entry.term.options.disableStdin = !interactive
  entry.term.options.cursorBlink = interactive
  entry.term.options.convertEol = !interactive
  entry.term.options.cursorInactiveStyle = interactive ? 'outline' : 'none'
}

function pasteIntoEntry(entry: Entry): Promise<boolean> {
  if (!entry.interactive || !entry.onInput) return Promise.resolve(false)
  return navigator.clipboard
    .readText()
    .then((text) => {
      if (!text) return false
      entry.onInput?.(text)
      return true
    })
    .catch(() => false)
}

function create(id: string, interactive: boolean): Entry {
  const term = new Terminal({
    convertEol: !interactive,
    disableStdin: !interactive,
    cursorBlink: interactive,
    cursorStyle: 'bar',
    cursorInactiveStyle: interactive ? 'outline' : 'none',
    scrollback: 8000,
    scrollOnUserInput: true,
    rightClickSelectsWord: false,
    macOptionIsMeta: true,
    fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Microsoft YaHei UI", monospace',
    fontSize: 12.5,
    lineHeight: 1.28,
    theme: {
      background: '#0f1115',
      foreground: '#c9d1d9',
      cursor: '#5ea8ff',
      selectionBackground: '#2b3a55'
    }
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((_event, uri) => void api.app.openExternal(uri)))

  const entry: Entry = {
    term,
    fit,
    opened: false,
    interactive,
    searchQuery: '',
    searchIndex: -1
  }
  applyInteractive(entry, interactive)

  term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if (e.type !== 'keydown') return true
    const ctrl = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    // 让全局快捷键（Ctrl+P 命令面板、Ctrl+` 切换终端、F12 DevTools）冒泡到 window，不被终端吞成控制字符
    if ((ctrl && (key === 'p' || e.key === '`' || e.code === 'Backquote')) || e.key === 'F12') {
      return false
    }

    // Ctrl+F 唤起日志/终端内搜索栏
    if (ctrl && key === 'f') {
      e.preventDefault()
      onSearchRequest?.()
      return false
    }

    // 智能 Ctrl+C / Ctrl+Shift+C / Ctrl+Insert：有选区时复制并清除选区；无选区时发送 SIGINT
    if ((ctrl && key === 'c' && (term.hasSelection() || e.shiftKey)) || (ctrl && e.key === 'Insert')) {
      const sel = term.getSelection()
      if (sel) {
        e.preventDefault()
        void navigator.clipboard.writeText(sel).catch(() => undefined)
        term.clearSelection()
      }
      return false
    }

    // 原生粘贴：Ctrl+V / Ctrl+Shift+V / Shift+Insert
    if (entry.interactive && ((ctrl && key === 'v') || (e.shiftKey && e.key === 'Insert'))) {
      e.preventDefault()
      void pasteIntoEntry(entry)
      return false
    }

    // Ctrl+L 清空当前屏幕
    if (entry.interactive && ctrl && !e.shiftKey && key === 'l') {
      e.preventDefault()
      clearTerminal(id)
      return false
    }

    return true
  })

  return entry
}

function getOrCreate(id: string, interactive = false): Entry {
  let entry = entries.get(id)
  if (!entry) {
    entry = create(id, interactive)
    entries.set(id, entry)
    return entry
  }
  if (interactive) applyInteractive(entry, true)
  return entry
}

/** 交互式终端必须在第一次写入前建好，否则会变成只读日志 */
export function ensureTerminal(id: string, interactive: boolean): void {
  if (interactive) getOrCreate(id, true)
  else if (!entries.has(id)) entries.set(id, create(id, false))
}

/** 终端未挂载到 DOM 时也可以写入，挂载后会显示完整内容 */
export function writeTerminal(id: string, chunk: string): void {
  getOrCreate(id).term.write(chunk)
}

export function bindTerminalInput(id: string, onData: (data: string) => void): () => void {
  const entry = getOrCreate(id, true)
  applyInteractive(entry, true)
  entry.onInput = onData
  const sub = entry.term.onData(onData)
  return () => {
    if (entry.onInput === onData) entry.onInput = undefined
    sub.dispose()
  }
}

/**
 * VS Code / Windows Terminal 同款右键交互：
 * - 有选区时：右键复制选区并取消高亮
 * - 无选区且为交互式终端时：右键直接粘贴剪贴板文本
 */
export async function handleTerminalContextMenu(id: string): Promise<'copied' | 'pasted' | null> {
  const entry = entries.get(id)
  if (!entry) return null
  if (entry.term.hasSelection()) {
    const sel = entry.term.getSelection()
    if (sel) {
      await navigator.clipboard.writeText(sel).catch(() => undefined)
      entry.term.clearSelection()
      return 'copied'
    }
  }
  if (entry.interactive) {
    const ok = await pasteIntoEntry(entry)
    entry.term.focus()
    return ok ? 'pasted' : null
  }
  return null
}

export function searchTerminal(
  id: string,
  rawQuery: string,
  direction: 'next' | 'prev' = 'next'
): { current: number; total: number } {
  const entry = entries.get(id)
  const q = rawQuery.toLowerCase()
  if (!entry || !q) {
    entry?.term.clearSelection()
    return { current: 0, total: 0 }
  }

  const buf = entry.term.buffer.active
  const matches: { row: number; col: number }[] = []
  for (let row = 0; row < buf.length; row++) {
    const line = buf.getLine(row)?.translateToString(true) ?? ''
    if (!line) continue
    const lower = line.toLowerCase()
    let from = 0
    while (from <= lower.length - q.length) {
      const idx = lower.indexOf(q, from)
      if (idx === -1) break
      matches.push({ row, col: idx })
      from = idx + Math.max(1, q.length)
    }
  }

  if (matches.length === 0) {
    entry.searchQuery = q
    entry.searchIndex = -1
    entry.term.clearSelection()
    return { current: 0, total: 0 }
  }

  let idx = entry.searchQuery === q ? entry.searchIndex : -1
  if (direction === 'next') {
    idx = (idx + 1) % matches.length
  } else {
    idx = idx <= 0 ? matches.length - 1 : idx - 1
  }
  entry.searchQuery = q
  entry.searchIndex = idx

  const target = matches[idx]
  entry.term.select(target.col, target.row, rawQuery.length)
  entry.term.scrollToLine(Math.max(0, target.row - 3))
  return { current: idx + 1, total: matches.length }
}

export function attachTerminal(id: string, container: HTMLElement, interactive = false): void {
  const entry = getOrCreate(id, interactive)
  if (interactive) applyInteractive(entry, true)
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
