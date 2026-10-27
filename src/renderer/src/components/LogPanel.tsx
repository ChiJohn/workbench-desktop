import { useEffect, useRef } from 'react'
import type { Project, RunSession, ShellSession } from '../../../shared/types'
import { api, unwrap } from '../api'
import { stripAnsi } from '../format'
import { stopScript } from '../queries'
import { useRuns } from '../stores/runs'
import { useShells } from '../stores/shells'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { attachTerminal, bindTerminalInput, clearTerminal, disposeTerminal, ensureTerminal, fitTerminal, focusTerminal } from '../terminals'

function TerminalView({
  runId,
  visible,
  interactive
}: {
  runId: string
  visible: boolean
  interactive?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) attachTerminal(runId, ref.current)
  }, [runId])

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
  }, [runId, visible, interactive])

  return <div ref={ref} className="terminal" style={{ display: visible ? 'block' : 'none' }} />
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
  const { sessions, order, active, stoppedByUser, setActive, remove } = useRuns()
  const shells = useShells()
  const open = useUi((s) => s.logOpen)
  const setOpen = useUi((s) => s.setLogOpen)
  const logTab = useUi((s) => s.logTab)
  const setLogTab = useUi((s) => s.setLogTab)
  const view = useUi((s) => s.view)
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
      toast.success('已复制')
    } catch (e) {
      toast.error(e, '复制失败')
    }
  }

  const openShell = async () => {
    try {
      const session = await unwrap(api.shell.open(projectId, 120, 24))
      ensureTerminal(session.id, true)
      shells.upsert(session)
      setLogTab({ kind: 'shell', id: session.id })
      setOpen(true)
    } catch (e) {
      toast.error(e, '终端没有打开')
    }
  }

  return (
    <section className={`log-panel${open ? ' open' : ''}`}>
      <div className="log-header">
        <button className="icon-btn" title={open ? '收起' : '展开'} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'}
        </button>
        <span className="log-title">日志</span>
        <div className="log-tabs">
          {!hasTabs && <span className="hint">点「终端」可以在这里敲命令</span>}
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
          <button
            className="btn btn-small"
            title={projectId ? '在当前项目打开终端' : '在用户目录打开终端'}
            onClick={() => void openShell()}
          >
            终端
          </button>
          {(currentRun || currentShell) && (
            <>
              <button className="btn btn-small btn-ghost" onClick={() => selected && clearTerminal(selected.id)}>
                清空
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => void copy()}>
                复制
              </button>
            </>
          )}
          {currentRun?.status === 'running' && (
            <button className="btn btn-small btn-danger" onClick={() => stopScript(currentRun.runId)}>
              停止
            </button>
          )}
        </div>
      </div>
      <div className="log-body" style={{ display: open && hasTabs ? 'block' : 'none' }}>
        {order.map((runId) => (
          <TerminalView key={runId} runId={runId} visible={open && selected?.kind === 'run' && selected.id === runId} />
        ))}
        {shells.order.map((id) => (
          <TerminalView
            key={id}
            runId={id}
            interactive
            visible={open && selected?.kind === 'shell' && selected.id === id}
          />
        ))}
      </div>
    </section>
  )
}
