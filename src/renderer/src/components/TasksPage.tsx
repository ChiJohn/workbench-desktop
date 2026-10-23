import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Prefs, Project, TapdBoard, TapdItem, TapdKind, TapdStatus } from '../../../shared/types'
import { clockTime } from '../format'
import { refreshTapdBoard, useSavePrefs } from '../queries'
import { useUi } from '../stores/ui'
import { TaskDetail } from './TaskDetail'

export const KIND_LABELS: Record<TapdKind, string> = { story: '需求', bug: '缺陷', task: '任务' }
const KINDS: TapdKind[] = ['story', 'bug', 'task']

interface Group {
  key: string
  workspaceName: string
  iterationId: string | null
  iterationName: string | null
  items: TapdItem[]
}

function groupItems(items: TapdItem[]): Group[] {
  const groups = new Map<string, Group>()
  for (const item of items) {
    const key = `${item.workspaceId}|${item.iterationId ?? ''}`
    let g = groups.get(key)
    if (!g) {
      g = { key, workspaceName: item.workspaceName, iterationId: item.iterationId, iterationName: item.iterationName, items: [] }
      groups.set(key, g)
    }
    g.items.push(item)
  }
  return [...groups.values()]
}

export function RepoSelect({
  value,
  projects,
  onChange
}: {
  value: string | undefined
  projects: Project[]
  onChange(id: string): void
}) {
  return (
    <select className="repo-select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">未关联仓库</option>
      {projects
        .filter((p) => p.available)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  )
}

interface Props {
  status?: TapdStatus
  board: UseQueryResult<TapdBoard>
  projects: Project[]
  prefs?: Prefs
}

export function TasksPage({ status, board, projects, prefs }: Props) {
  const qc = useQueryClient()
  const savePrefs = useSavePrefs()
  const taskKey = useUi((s) => s.taskKey)
  const setTaskKey = useUi((s) => s.setTaskKey)
  const setView = useUi((s) => s.setView)
  const [workspace, setWorkspace] = useState('all')
  const [kinds, setKinds] = useState<Set<TapdKind>>(new Set(KINDS))
  const [statusLabel, setStatusLabel] = useState('all')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  const items = board.data?.items ?? []
  const statusLabels = useMemo(() => [...new Set(items.map((i) => i.statusLabel))].sort(), [items])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(
      (i) =>
        (workspace === 'all' || i.workspaceId === workspace) &&
        kinds.has(i.kind) &&
        (statusLabel === 'all' || i.statusLabel === statusLabel) &&
        (!q || i.title.toLowerCase().includes(q) || i.id.includes(q))
    )
  }, [items, workspace, kinds, statusLabel, search])
  const groups = useMemo(() => groupItems(filtered), [filtered])

  if (!status) return <div className="page hint">读取 TAPD 配置…</div>
  if (!status.hasToken) {
    return (
      <div className="page empty">
        <h1>任务</h1>
        <p className="hint">还没有配置 TAPD 令牌。</p>
        <button className="btn btn-primary" onClick={() => setView({ kind: 'settings' })}>
          去设置
        </button>
      </div>
    )
  }

  const refresh = async () => {
    setRefreshing(true)
    await refreshTapdBoard(qc, true)
    setRefreshing(false)
  }
  const toggleKind = (k: TapdKind) => {
    const next = new Set(kinds)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setKinds(next)
  }
  const toggleGroup = (key: string) => {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed(next)
  }

  return (
    <div className="page tasks-page">
      <div className="page-header">
        <h1>任务</h1>
        {board.data && <span className="badge">{board.data.user}</span>}
        <span className="spacer" />
        {board.data && <span className="hint">上次刷新 {clockTime(board.data.fetchedAt)}</span>}
        <button className="btn" disabled={refreshing || board.isFetching} onClick={refresh}>
          {refreshing || board.isFetching ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div className="task-filters">
        <select value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
          <option value="all">全部项目</option>
          {board.data?.workspaces
            .filter((w) => w.enabled)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
        </select>
        <div className="segmented">
          {KINDS.map((k) => (
            <button key={k} className={kinds.has(k) ? 'on' : ''} onClick={() => toggleKind(k)}>
              {KIND_LABELS[k]} {items.filter((i) => i.kind === k).length}
            </button>
          ))}
        </div>
        <select value={statusLabel} onChange={(e) => setStatusLabel(e.target.value)}>
          <option value="all">全部状态</option>
          {statusLabels.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input className="task-search" placeholder="搜索标题 / 单号" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {board.data?.errors.map((e) => (
        <div key={e.workspaceId} className="error-text">
          {e.workspaceName}：{e.message}
        </div>
      ))}

      <div className={`tasks-layout${taskKey ? ' with-detail' : ''}`}>
        <div className="task-groups">
          {board.isPending && <p className="hint">从 TAPD 拉取中…</p>}
          {board.isError && (
            <p className="error-text">
              {board.error.message}{' '}
              <button className="btn btn-small" onClick={refresh}>
                重试
              </button>
            </p>
          )}
          {board.data && groups.length === 0 && <p className="hint">没有符合条件的单子。</p>}
          {groups.map((g) => {
            const open = !collapsed.has(g.key)
            return (
              <section key={g.key} className="task-group">
                <div className="task-group-head">
                  <button className="icon-btn" onClick={() => toggleGroup(g.key)}>
                    {open ? '▾' : '▸'}
                  </button>
                  <span className="task-group-title" onClick={() => toggleGroup(g.key)}>
                    {g.iterationId ? (g.iterationName ?? g.iterationId) : '未规划迭代'}
                  </span>
                  <span className="muted">
                    {g.workspaceName} · {g.items.length}
                  </span>
                  {g.iterationId && (
                    <label className="inline-field">
                      仓库
                      <RepoSelect
                        value={prefs?.tapd?.iterationRepos?.[g.iterationId]}
                        projects={projects}
                        onChange={(id) => savePrefs.mutate({ tapd: { iterationRepos: { [g.iterationId as string]: id } } })}
                      />
                    </label>
                  )}
                </div>
                {open &&
                  g.items.map((item) => (
                    <div
                      key={item.key}
                      className={`task-row${item.key === taskKey ? ' selected' : ''}`}
                      onClick={() => setTaskKey(item.key)}
                    >
                      <span className={`kind-badge ${item.kind}`}>{KIND_LABELS[item.kind]}</span>
                      <span className="task-title" title={item.title}>
                        {item.title}
                      </span>
                      <span className="task-status">{item.statusLabel}</span>
                      <span className="muted mono task-time">{item.modified.slice(5, 16)}</span>
                    </div>
                  ))}
              </section>
            )
          })}
        </div>
        {taskKey && (
          <TaskDetail
            key={taskKey}
            itemKey={taskKey}
            projects={projects}
            prefs={prefs}
            onClose={() => setTaskKey(null)}
          />
        )}
      </div>
    </div>
  )
}
