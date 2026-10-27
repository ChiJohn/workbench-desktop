import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { MulticaOverview, Prefs, TodoItem } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk, refreshMultica, useMulticaOverview } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'

const DEFAULT_AGENT = '前端开发'

export function TodoPanel({ prefs }: { prefs?: Prefs }) {
  const overview = useMulticaOverview()
  const openIssue = useUi((s) => s.openIssue)
  const [items, setItems] = useState<TodoItem[]>([])
  const [draft, setDraft] = useState('')
  const [dispatching, setDispatching] = useState<TodoItem | null>(null)

  const reload = async () => setItems(await unwrap(api.todo.list()))

  useEffect(() => {
    void reload().catch((e) => toast.error(e, '读取待办失败'))
  }, [])

  const add = async () => {
    const text = draft.trim()
    if (!text) return
    try {
      setItems(await unwrap(api.todo.add(text)))
      setDraft('')
    } catch (e) {
      toast.error(e, '添加失败')
    }
  }

  const toggle = async (id: string) => {
    try {
      setItems(await unwrap(api.todo.toggle(id)))
    } catch (e) {
      toast.error(e, '更新失败')
    }
  }

  const remove = async (id: string) => {
    try {
      setItems(await unwrap(api.todo.remove(id)))
    } catch (e) {
      toast.error(e, '删除失败')
    }
  }

  return (
    <div className="todo-panel">
      <div className="todo-list">
        {items.length === 0 && <p className="hint">还没有待办</p>}
        {items.map((item) => (
          <div key={item.id} className={`todo-row${item.done ? ' done' : ''}`}>
            <input type="checkbox" checked={item.done} onChange={() => toggle(item.id)} />
            <span className="todo-text" title={item.text}>
              {item.text}
            </span>
            {item.issue ? (
              <button
                className="btn btn-small btn-ghost"
                onClick={() => {
                  const found = overview.data?.issues.find((i) => i.identifier === item.issue)
                  openIssue(found?.id ?? item.issue!)
                }}
              >
                {item.issue}
              </button>
            ) : (
              <button className="btn btn-small" disabled={!overview.data} onClick={() => setDispatching(item)}>
                派单
              </button>
            )}
            <button className="icon-btn" title="删除" onClick={() => remove(item.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
      <input
        className="todo-input"
        value={draft}
        placeholder="添加待办，回车保存"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void add()
        }}
      />
      {dispatching && overview.data && (
        <TodoDispatch
          item={dispatching}
          overview={overview.data}
          prefs={prefs}
          onClose={() => setDispatching(null)}
          onDone={async (next) => {
            setItems(next)
            setDispatching(null)
          }}
        />
      )}
    </div>
  )
}

function TodoDispatch({
  item,
  overview,
  prefs,
  onClose,
  onDone
}: {
  item: TodoItem
  overview: MulticaOverview
  prefs?: Prefs
  onClose(): void
  onDone(items: TodoItem[]): void
}) {
  const qc = useQueryClient()
  const { agents, projects } = overview
  const lastAgent = prefs?.multica?.lastAgentId
  const [title, setTitle] = useState(item.text)
  const [projectId, setProjectId] = useState('')
  const [agentId, setAgentId] = useState(
    () => agents.find((a) => a.id === lastAgent)?.id ?? agents.find((a) => a.name === DEFAULT_AGENT)?.id ?? ''
  )
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const next = await unwrap(
        api.todo.dispatch({ id: item.id, title: title.trim() || item.text, projectId: projectId || null, agentId: agentId || null })
      )
      toast.success('已派单', title.trim() || item.text)
      await qc.invalidateQueries({ queryKey: qk.prefs })
      await refreshMultica(qc, false)
      onDone(next)
    } catch (e) {
      toast.error(e, '派单失败')
      setBusy(false)
    }
  }

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal form" onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
        <h2>派给智能体</h2>
        <label>
          <span>标题</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span>multica 项目（{overview.workspace.name}）</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">不归属项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>智能体</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">暂不指派（只建单）</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <p className={agentId ? 'warn-text' : 'hint'}>
          {agentId ? '指派后智能体会在本机开始处理。' : '不指派不会触发运行。'}
        </p>
        <div className="button-row">
          <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? '派单中…' : '派单'}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
