import { useEffect, useRef } from 'react'
import type { Project, RunSession } from '../../../shared/types'
import { api, unwrap } from '../api'
import { stripAnsi } from '../format'
import { stopScript } from '../queries'
import { useRuns } from '../stores/runs'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { attachTerminal, clearTerminal, disposeTerminal, fitTerminal } from '../terminals'

function TerminalView({ runId, visible }: { runId: string; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) attachTerminal(runId, ref.current)
  }, [runId])

  useEffect(() => {
    if (!visible || !ref.current) return
    fitTerminal(runId)
    const observer = new ResizeObserver(() => fitTerminal(runId))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [runId, visible])

  return <div ref={ref} className="terminal" style={{ display: visible ? 'block' : 'none' }} />
}

function tabState(s: RunSession, stoppedByUser: boolean): 'running' | 'ok' | 'failed' {
  if (s.status === 'running') return 'running'
  return s.exitCode === 0 || stoppedByUser ? 'ok' : 'failed'
}

export function LogPanel({ projects }: { projects: Project[] }) {
  const { sessions, order, active, stoppedByUser, setActive, remove } = useRuns()
  const open = useUi((s) => s.logOpen)
  const setOpen = useUi((s) => s.setLogOpen)
  const current = active ? sessions[active] : undefined
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? id

  const close = async (runId: string) => {
    try {
      await unwrap(api.runner.dispose(runId))
    } catch (e) {
      toast.error(e, '关闭失败')
      return
    }
    disposeTerminal(runId)
    remove(runId)
  }

  const copy = async (runId: string) => {
    try {
      const text = await unwrap(api.runner.buffer(runId))
      await navigator.clipboard.writeText(stripAnsi(text))
      toast.success('日志已复制')
    } catch (e) {
      toast.error(e, '复制失败')
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
          {order.length === 0 && <span className="hint">还没有运行过脚本</span>}
          {order.map((runId) => {
            const s = sessions[runId]
            const state = tabState(s, Boolean(stoppedByUser[runId]))
            return (
              <div
                key={runId}
                className={`log-tab${runId === active ? ' active' : ''} ${state}`}
                onClick={() => {
                  setActive(runId)
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
                      close(runId)
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {current && (
          <div className="log-actions">
            <button className="btn btn-small btn-ghost" onClick={() => clearTerminal(current.runId)}>
              清空
            </button>
            <button className="btn btn-small btn-ghost" onClick={() => copy(current.runId)}>
              复制
            </button>
            {current.status === 'running' && (
              <button className="btn btn-small btn-danger" onClick={() => stopScript(current.runId)}>
                停止
              </button>
            )}
          </div>
        )}
      </div>
      <div className="log-body" style={{ display: open && order.length > 0 ? 'block' : 'none' }}>
        {order.map((runId) => (
          <TerminalView key={runId} runId={runId} visible={open && runId === active} />
        ))}
      </div>
    </section>
  )
}
