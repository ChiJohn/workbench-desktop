import { useEffect, useRef, useState } from 'react'
import type { Project, RunSession, ShellKind, ShellSession } from '../../../shared/types'
import { api, unwrap } from '../api'
import { stripAnsi } from '../format'
import { stopScript } from '../queries'
import { useRuns } from '../stores/runs'
import { useShells } from '../stores/shells'
import { toast } from '../stores/toast'
import { useUi, type LogDock } from '../stores/ui'
import {
  attachTerminal,
  bindTerminalInput,
  clearTerminal,
  disposeTerminal,
  ensureTerminal,
  fitTerminal,
  focusTerminal,
  handleTerminalContextMenu,
  searchTerminal,
  setTerminalSearchHandler
} from '../terminals'

const LOG_HEIGHT_KEY = 'wb.logHeight'
const LOG_WIDTH_KEY = 'wb.logWidth'
const SHELL_KIND_KEY = 'wb.shellKind'
const DEFAULT_LOG_HEIGHT = 280
const DEFAULT_LOG_WIDTH = 460

const DOCK_OPTIONS: { value: LogDock; icon: string; label: string }[] = [
  { value: 'bottom', icon: '⬓', label: '停靠在底部' },
  { value: 'left', icon: '◧', label: '停靠在左侧分栏' },
  { value: 'right', icon: '◨', label: '停靠在右侧分栏' },
  { value: 'maximized', icon: '⛶', label: '最大化铺满' }
]

function clampLogHeight(h: number): number {
  const max = typeof window !== 'undefined' ? Math.max(240, Math.floor(window.innerHeight * 0.72)) : 640
  return Math.max(140, Math.min(max, Math.round(h)))
}

function clampLogWidth(w: number): number {
  const max = typeof window !== 'undefined' ? Math.max(360, Math.floor(window.innerWidth * 0.65)) : 860
  return Math.max(280, Math.min(max, Math.round(w)))
}

function TerminalView({
  runId,
  visible,
  interactive,
  dock
}: {
  runId: string
  visible: boolean
  interactive?: boolean
  dock: LogDock
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) attachTerminal(runId, ref.current, Boolean(interactive))
  }, [runId, interactive])

  useEffect(() => {
    if (!interactive) return
    return bindTerminalInput(runId, (data) => {
      void unwrap(api.shell.write(runId, data)).catch(() => undefined)
    })
  }, [runId, interactive])

  useEffect(() => {
    if (!visible || !ref.current) return
    const sendSize = () => {
      const size = fitTerminal(runId)
      if (interactive && size) void unwrap(api.shell.resize(runId, size.cols, size.rows)).catch(() => undefined)
    }
    sendSize()
    if (interactive) focusTerminal(runId)
    const observer = new ResizeObserver(sendSize)
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [runId, visible, interactive, dock])

  return (
    <div
      ref={ref}
      className="terminal"
      style={{ display: visible ? 'block' : 'none' }}
      onMouseDown={() => {
        if (interactive && visible) focusTerminal(runId)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        void handleTerminalContextMenu(runId).then((res) => {
          if (res === 'copied') toast.success('已复制选中内容')
        })
      }}
    />
  )
}

function tabState(s: RunSession, stoppedByUser: boolean): 'running' | 'ok' | 'failed' {
  if (s.status === 'running') return 'running'
  return s.exitCode === 0 || stoppedByUser ? 'ok' : 'failed'
}

function shellState(s: ShellSession): 'running' | 'ok' | 'failed' {
  if (s.status === 'running') return 'running'
  return s.exitCode === 0 || s.exitCode === null ? 'ok' : 'failed'
}

export function LogPanel({ projects }: { projects: Project[] }) {
  const { sessions, order, active, stoppedByUser, urls, setActive, remove } = useRuns()
  const shells = useShells()
  const open = useUi((s) => s.logOpen)
  const setOpen = useUi((s) => s.setLogOpen)
  const logDock = useUi((s) => s.logDock)
  const setLogDock = useUi((s) => s.setLogDock)
  const logTab = useUi((s) => s.logTab)
  const setLogTab = useUi((s) => s.setLogTab)
  const view = useUi((s) => s.view)
  const bodyRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [height, setHeight] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(LOG_HEIGHT_KEY))
      return Number.isFinite(saved) && saved >= 140 ? clampLogHeight(saved) : DEFAULT_LOG_HEIGHT
    } catch {
      return DEFAULT_LOG_HEIGHT
    }
  })
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(LOG_WIDTH_KEY))
      return Number.isFinite(saved) && saved >= 280 ? clampLogWidth(saved) : DEFAULT_LOG_WIDTH
    } catch {
      return DEFAULT_LOG_WIDTH
    }
  })
  const [shellKind, setShellKind] = useState<ShellKind>(() => {
    try {
      const saved = localStorage.getItem(SHELL_KIND_KEY)
      return saved === 'bash' || saved === 'cmd' ? saved : 'powershell'
    } catch {
      return 'powershell'
    }
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchResult, setSearchResult] = useState<{ current: number; total: number }>({ current: 0, total: 0 })

  const projectId = view.kind === 'project' ? view.id : null
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? id

  const selected = (() => {
    if (logTab?.kind === 'run' && sessions[logTab.id]) return logTab
    if (logTab?.kind === 'shell' && shells.sessions[logTab.id]) return logTab
    if (active && sessions[active]) return { kind: 'run' as const, id: active }
    const lastShell = shells.order[shells.order.length - 1]
    if (lastShell) return { kind: 'shell' as const, id: lastShell }
    return null
  })()
  const currentRun = selected?.kind === 'run' ? sessions[selected.id] : undefined
  const currentShell = selected?.kind === 'shell' ? shells.sessions[selected.id] : undefined
  const hasTabs = order.length > 0 || shells.order.length > 0

  useEffect(() => {
    setTerminalSearchHandler(() => {
      setSearchOpen(true)
      setTimeout(() => searchInputRef.current?.focus(), 0)
    })
    return () => setTerminalSearchHandler(null)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key !== '`' && e.code !== 'Backquote') return
      e.preventDefault()

      const shellOrder = useShells.getState().order
      const lastShell = shellOrder[shellOrder.length - 1]
      const ui = useUi.getState()

      if (!lastShell) {
        void openShell()
        return
      }
      if (!ui.logOpen) {
        ui.setLogTab({ kind: 'shell', id: lastShell })
        ui.setLogOpen(true)
        setTimeout(() => focusTerminal(lastShell), 0)
        return
      }
      if (ui.logTab?.kind !== 'shell') {
        ui.setLogTab({ kind: 'shell', id: lastShell })
        setTimeout(() => focusTerminal(lastShell), 0)
        return
      }
      ui.setLogOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const runSearch = (query: string, dir: 'next' | 'prev' = 'next') => {
    if (!selected) return
    setSearchResult(searchTerminal(selected.id, query, dir))
  }

  const close = async (runId: string) => {
    try {
      await unwrap(api.runner.dispose(runId))
    } catch (e) {
      toast.error(e, '关闭失败')
      return
    }
    disposeTerminal(runId)
    remove(runId)
    if (selected?.kind === 'run' && selected.id === runId) setLogTab(null)
  }

  const closeShell = async (id: string) => {
    try {
      await unwrap(api.shell.close(id))
    } catch (e) {
      toast.error(e, '关闭终端失败')
      return
    }
    disposeTerminal(id)
    shells.remove(id)
    if (selected?.kind === 'shell' && selected.id === id) setLogTab(null)
  }

  const copy = async () => {
    try {
      const text =
        selected?.kind === 'shell'
          ? (await unwrap(api.shell.buffer(selected.id))).text
          : selected?.kind === 'run'
            ? await unwrap(api.runner.buffer(selected.id))
            : ''
      await navigator.clipboard.writeText(stripAnsi(text))
      toast.success('已复制全部日志')
    } catch (e) {
      toast.error(e, '复制失败')
    }
  }

  const openShell = async (kind = shellKind) => {
    try {
      const w = bodyRef.current?.clientWidth || window.innerWidth
      const cols = Math.max(80, Math.floor((w - 24) / 7.6))
      const rows = Math.max(16, Math.floor((height - 16) / 16))
      const session = await unwrap(api.shell.open(projectId, cols, rows, kind))
      ensureTerminal(session.id, true)
      shells.upsert(session)
      setLogTab({ kind: 'shell', id: session.id })
      setOpen(true)
    } catch (e) {
      toast.error(e, '终端没有打开')
    }
  }

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    if (logDock === 'left' || logDock === 'right') {
      const startX = e.clientX
      const startW = width
      let latest = startW
      const onMove = (ev: PointerEvent) => {
        const delta = logDock === 'right' ? startX - ev.clientX : ev.clientX - startX
        latest = clampLogWidth(startW + delta)
        setWidth(latest)
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        try {
          localStorage.setItem(LOG_WIDTH_KEY, String(latest))
        } catch {
          // ignore
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }

    const startY = e.clientY
    const startH = height
    let latest = startH
    const onMove = (ev: PointerEvent) => {
      latest = clampLogHeight(startH + (startY - ev.clientY))
      setHeight(latest)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try {
        localStorage.setItem(LOG_HEIGHT_KEY, String(latest))
      } catch {
        // ignore
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const activeUrl = currentRun ? urls[currentRun.runId] : undefined
  const isSideDock = logDock === 'left' || logDock === 'right'
  const panelStyle =
    open && isSideDock ? { width: `${width}px` } : undefined
  const bodyStyle =
    open && hasTabs
      ? logDock === 'bottom'
        ? { display: 'block', height: `${height}px` }
        : { display: 'block' }
      : { display: 'none' }

  return (
    <section className={`log-panel dock-${logDock}${open ? ' open' : ''}`} style={panelStyle}>
      {open && hasTabs && logDock !== 'maximized' && (
        <div
          className={`log-resizer resizer-${logDock}`}
          title={isSideDock ? '左右拖动调整终端宽度' : '上下拖动调整终端高度'}
          onPointerDown={startResize}
        />
      )}
      <div className="log-header">
        <button className="icon-btn" title={open ? '收起' : '展开'} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'}
        </button>
        <span className="log-title">日志</span>
        <div className="log-tabs">
          {!hasTabs && <span className="hint">点右侧「＋终端」打开命令行（支持选中 Ctrl+C 复制、右键粘贴、Ctrl+F 搜索）</span>}
          {order.map((runId) => {
            const s = sessions[runId]
            const state = tabState(s, Boolean(stoppedByUser[runId]))
            const on = selected?.kind === 'run' && selected.id === runId
            return (
              <div
                key={runId}
                className={`log-tab${on ? ' active' : ''} ${state}`}
                onClick={() => {
                  setActive(runId)
                  setLogTab({ kind: 'run', id: runId })
                  setOpen(true)
                }}
              >
                <span className={`tab-dot ${state}`} />
                {nameOf(s.projectId)}:{s.script}
                {state === 'failed' && <span className="exit-code">({s.exitCode})</span>}
                {s.status === 'exited' && (
                  <button
                    className="tab-close"
                    title="关闭"
                    onClick={(e) => {
                      e.stopPropagation()
                      void close(runId)
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
          {shells.order.map((id) => {
            const s = shells.sessions[id]
            const state = shellState(s)
            const on = selected?.kind === 'shell' && selected.id === id
            return (
              <div
                key={id}
                className={`log-tab${on ? ' active' : ''} ${state}`}
                title={s.cwd}
                onClick={() => {
                  setLogTab({ kind: 'shell', id })
                  setOpen(true)
                }}
              >
                <span className={`tab-dot ${state}`} />
                {s.title}
                {state === 'failed' && s.exitCode !== null && <span className="exit-code">({s.exitCode})</span>}
                <button
                  className="tab-close"
                  title="关闭终端"
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeShell(id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
        <div className="log-actions">
          {activeUrl && (
            <button
              className="btn btn-small"
              title={activeUrl}
              onClick={() => void api.app.openExternal(activeUrl)}
            >
              打开页面 ↗
            </button>
          )}
          <select
            className="shell-kind-select"
            value={shellKind}
            title="选择新建终端的 Shell 类型"
            onChange={(e) => {
              const next = e.target.value as ShellKind
              setShellKind(next)
              try {
                localStorage.setItem(SHELL_KIND_KEY, next)
              } catch {
                // ignore
              }
            }}
          >
            <option value="powershell">PowerShell</option>
            <option value="bash">Git Bash</option>
            <option value="cmd">CMD</option>
          </select>
          <button
            className="btn btn-small"
            title={projectId ? '在当前项目打开新终端（Ctrl+` 切换显示）' : '在用户目录打开新终端（Ctrl+` 切换显示）'}
            onClick={() => void openShell()}
          >
            ＋终端
          </button>
          {(currentRun || currentShell) && (
            <>
              <button
                className={`btn btn-small btn-ghost${searchOpen ? ' active' : ''}`}
                title="在终端中搜索（Ctrl+F）"
                onClick={() => {
                  const next = !searchOpen
                  setSearchOpen(next)
                  if (next) setTimeout(() => searchInputRef.current?.focus(), 0)
                }}
              >
                查找
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => selected && clearTerminal(selected.id)}>
                清空
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => void copy()}>
                复制全部
              </button>
            </>
          )}
          {currentRun?.status === 'running' && (
            <button className="btn btn-small btn-danger" onClick={() => stopScript(currentRun.runId)}>
              停止
            </button>
          )}
          <div className="log-dock-group" title="切换终端停靠布局（底部 / 左侧 / 右侧 / 最大化）">
            {DOCK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`icon-btn dock-btn${logDock === opt.value ? ' on' : ''}`}
                title={opt.label}
                onClick={() => setLogDock(opt.value)}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        </div>
      </div>
      {open && hasTabs && searchOpen && (
        <div className="log-search-bar">
          <input
            ref={searchInputRef}
            value={searchText}
            placeholder="输入关键词查找（Enter 下一个，Shift+Enter 上一个）"
            onChange={(e) => {
              setSearchText(e.target.value)
              runSearch(e.target.value, 'next')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                runSearch(searchText, e.shiftKey ? 'prev' : 'next')
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setSearchOpen(false)
                if (selected) focusTerminal(selected.id)
              }
            }}
          />
          <span className="mono muted log-search-count">
            {searchText ? `${searchResult.current}/${searchResult.total}` : '0/0'}
          </span>
          <button
            className="btn btn-small btn-ghost"
            type="button"
            disabled={!searchText || searchResult.total === 0}
            title="上一个（Shift+Enter）"
            onClick={() => runSearch(searchText, 'prev')}
          >
            ↑
          </button>
          <button
            className="btn btn-small btn-ghost"
            type="button"
            disabled={!searchText || searchResult.total === 0}
            title="下一个（Enter）"
            onClick={() => runSearch(searchText, 'next')}
          >
            ↓
          </button>
          <button
            className="icon-btn"
            type="button"
            title="关闭查找（Esc）"
            onClick={() => {
              setSearchOpen(false)
              if (selected) focusTerminal(selected.id)
            }}
          >
            ×
          </button>
        </div>
      )}
      <div
        ref={bodyRef}
        className="log-body"
        style={bodyStyle}
      >
        {order.map((runId) => (
          <TerminalView
            key={runId}
            runId={runId}
            dock={logDock}
            visible={open && selected?.kind === 'run' && selected.id === runId}
          />
        ))}
        {shells.order.map((id) => (
          <TerminalView
            key={id}
            runId={id}
            dock={logDock}
            interactive
            visible={open && selected?.kind === 'shell' && selected.id === id}
          />
        ))}
      </div>
    </section>
  )
}
