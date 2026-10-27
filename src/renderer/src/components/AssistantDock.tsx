import { useEffect, useRef, useState } from 'react'
import type { AssistantClientAction, AssistantContext, AssistantMessage, AssistantMode, AssistantPending, AssistantTurn, ReportWriter } from '../../../shared/types'
import { api, unwrap } from '../api'
import { usePrefs, useRegistry, useSavePrefs } from '../queries'
import { useReport } from '../stores/report'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { WRITER_OPTIONS } from './ReportsPage'
import { useFabDrag } from '../useFabDrag'

const MODES: { value: AssistantMode; label: string }[] = [
  { value: 'ask', label: '问答' },
  { value: 'act', label: '操作' }
]

function applyAction(action: AssistantClientAction | null): void {
  if (!action) return
  if (action.type === 'dispatch') {
    useUi.getState().setView({ kind: 'tasks' })
    useUi.getState().setTaskKey(action.tapdKey)
    useUi.getState().setDispatchDraft({ tapdKey: action.tapdKey, title: action.title })
    return
  }
  if (action.type === 'report') {
    useReport.getState().open(action.kind)
    useUi.getState().setView({ kind: 'reports' })
    useUi.getState().setReportDraft({ kind: action.kind, notes: action.notes })
    return
  }
  useUi.getState().openProjectEditor({ mode: 'add', name: action.name, repoPath: action.repoPath })
}

export function AssistantDock() {
  const prefs = usePrefs()
  const registry = useRegistry()
  const save = useSavePrefs()
  const view = useUi((s) => s.view)
  const taskKey = useUi((s) => s.taskKey)
  const issueId = useUi((s) => s.issueId)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [pending, setPending] = useState<AssistantPending | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const inflight = useRef(false)

  const writer = prefs.data?.assistant?.writer ?? 'cursor'
  const mode = prefs.data?.assistant?.mode ?? 'ask'

  useEffect(() => api.on.assistantProgress(setProgress), [])
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages, pending, progress, open])

  const context = (): AssistantContext => {
    const project = view.kind === 'project' ? registry.data?.projects.find((item) => item.id === view.id) : undefined
    return {
      view: view.kind,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      taskKey,
      issueId
    }
  }

  const accept = (turn: AssistantTurn) => {
    setMessages(turn.messages)
    setPending(turn.pending)
    applyAction(turn.clientAction)
    setProgress('')
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || busy || pending) return
    setDraft('')
    setMessages((prev) => [...prev, { role: 'user', text }])
    setBusy(true)
    inflight.current = true
    setProgress('正在发送…')
    try {
      accept(await unwrap(api.assistant.send(text, context())))
    } catch (error) {
      setMessages((prev) => prev.slice(0, -1))
      setDraft(text)
      toast.error(error, '助手没有答上来')
      setProgress('')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!pending || busy) return
    setBusy(true)
    inflight.current = true
    setProgress('正在执行…')
    try {
      accept(await unwrap(api.assistant.confirm()))
    } catch (error) {
      toast.error(error, '操作没有完成')
      setProgress('')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  const stop = async () => {
    try {
      const turn = await unwrap(api.assistant.cancel())
      if (!inflight.current) accept(turn)
    } catch (error) {
      toast.error(error, '停止失败')
    }
  }

  const setWriter = (value: ReportWriter) => save.mutate({ assistant: { writer: value } })
  const setMode = (value: AssistantMode) => save.mutate({ assistant: { mode: value } })
  const drag = useFabDrag('wb.fab.assistant', open)

  return (
    <>
      <button
        ref={drag.fabRef}
        className={`assistant-fab${drag.dragging ? ' dragging' : ''}`}
        style={drag.fabStyle}
        title="助手，按住可拖动"
        onPointerDown={drag.onPointerDown}
        onClick={(event) => {
          drag.onClick(event)
          if (!event.defaultPrevented) setOpen(!open)
        }}
      >
        AI
      </button>
      {open && (
        <section ref={drag.setPanel} className="assistant-panel" style={drag.panelStyle}>
          <div className="assistant-head">
            <strong>助手</strong>
            <select value={writer} disabled={busy || save.isPending} onChange={(e) => setWriter(e.target.value as ReportWriter)}>
              {WRITER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select value={mode} disabled={busy || save.isPending} onChange={(e) => setMode(e.target.value as AssistantMode)}>
              {MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="spacer" />
            <button className="icon-btn" title="关闭" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="assistant-log" ref={logRef}>
            {messages.length === 0 && (
              <p className="hint">可以问项目状态、待办和笔记。操作模式可以代为打开项目、拉取代码、运行脚本，执行前会先确认。</p>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`assistant-msg ${message.role}`}>
                {message.text}
              </div>
            ))}
            {pending && (
              <div className="assistant-confirm">
                <div className="assistant-confirm-title">{pending.label}</div>
                <p>{pending.summary}</p>
                <div className="button-row">
                  <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void confirm()}>
                    确认
                  </button>
                  <button className="btn btn-small" disabled={busy} onClick={() => void stop()}>
                    取消
                  </button>
                </div>
              </div>
            )}
            {progress && <p className="hint assistant-progress">{progress}</p>}
          </div>
          <div className="assistant-compose">
            <textarea
              rows={2}
              value={draft}
              placeholder={pending ? '先确认或取消上一步' : '问一句，Enter 发送'}
              disabled={Boolean(pending)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            {busy ? (
              <button className="btn btn-small" onClick={() => void stop()}>
                停止
              </button>
            ) : (
              <button className="btn btn-primary btn-small" disabled={!draft.trim() || Boolean(pending)} onClick={() => void send()}>
                发送
              </button>
            )}
          </div>
        </section>
      )}
    </>
  )
}
