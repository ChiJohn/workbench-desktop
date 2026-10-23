import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { MulticaIssue, MulticaOverview, Project } from '../../../shared/types'
import { api, ApiError, unwrap } from '../api'
import { clockTime, localTime } from '../format'
import { refreshMultica } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { IssuePanel } from './IssuePanel'

export const ISSUE_STATUS_LABELS: Record<string, string> = {
  backlog: '待规划',
  todo: '待办',
  in_progress: '进行中',
  in_review: '审核中',
  blocked: '阻塞',
  done: '已完成',
  cancelled: '已取消'
}

const COLUMNS: { title: string; statuses: string[] }[] = [
  { title: '进行中', statuses: ['in_progress'] },
  { title: '审核中', statuses: ['in_review'] },
  { title: '阻塞', statuses: ['blocked'] },
  { title: '待办', statuses: ['todo', 'backlog'] }
]

export async function launchMultica(): Promise<void> {
  try {
    await unwrap(api.multica.launchDesktop())
    toast.success('已启动 multica 桌面端')
  } catch (e) {
    toast.error(e, '启动失败')
  }
}

export function IssueRow({ issue, selected, onClick }: { issue: MulticaIssue; selected?: boolean; onClick(): void }) {
  return (
    <div className={`issue-row${selected ? ' selected' : ''}`} onClick={onClick}>
      <div className="issue-row-head">
        <span className="mono muted">{issue.identifier}</span>
        <span className="issue-title" title={issue.title}>
          {issue.title}
        </span>
      </div>
      <div className="issue-row-meta muted">
        <span>{issue.assigneeName ?? '未指派'}</span>
        {issue.projectTitle && <span>{issue.projectTitle}</span>}
        <span className="spacer" />
        <span className="mono">{localTime(issue.updatedAt)}</span>
      </div>
    </div>
  )
}

export function MulticaError({ error }: { error: Error }) {
  const setView = useUi((s) => s.setView)
  const code = error instanceof ApiError ? error.code : ''
  return (
    <div className="card">
      <p className="error-text">{error.message}</p>
      {code === 'MULTICA_NOT_LOGGED_IN' && <p className="hint">先在 multica 桌面端登录，工作台复用桌面端的 CLI 登录信息。</p>}
      {code === 'MULTICA_CLI_MISSING' && <p className="hint">没有找到 multica CLI，确认已安装桌面端，或在设置里填写 CLI 路径。</p>}
      <div className="button-row">
        <button className="btn" onClick={launchMultica}>
          启动 Multica
        </button>
        <button className="btn btn-ghost" onClick={() => setView({ kind: 'settings' })}>
          去设置
        </button>
      </div>
    </div>
  )
}

interface Props {
  overview: UseQueryResult<MulticaOverview>
  projects: Project[]
}

export function AgentsPage({ overview, projects }: Props) {
  const qc = useQueryClient()
  const issueId = useUi((s) => s.issueId)
  const setIssueId = useUi((s) => s.setIssueId)
  const [projectFilter, setProjectFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  const data = overview.data
  const issues = useMemo(
    () =>
      (data?.issues ?? []).filter(
        (i) => projectFilter === 'all' || (projectFilter === 'none' ? !i.projectId : i.projectId === projectFilter)
      ),
    [data, projectFilter]
  )

  const refresh = async () => {
    setRefreshing(true)
    await refreshMultica(qc, true)
    setRefreshing(false)
  }

  return (
    <div className="page tasks-page">
      <div className="page-header">
        <h1>智能体</h1>
        {data && <span className="badge">{data.workspace.name}</span>}
        {data && (
          <span className={data.daemon?.running ? 'muted' : 'warn-text'}>
            守护进程：
            {data.daemon === null ? '状态未知' : data.daemon.running ? `运行中 · ${data.daemon.runningTasks} 个任务` : '已停止'}
          </span>
        )}
        {data && !data.daemon?.running && (
          <button className="btn btn-small" onClick={launchMultica}>
            启动 Multica
          </button>
        )}
        <span className="spacer" />
        {data && <span className="hint">上次刷新 {clockTime(data.fetchedAt)}</span>}
        <button className="btn" disabled={refreshing || overview.isFetching} onClick={refresh}>
          {refreshing || overview.isFetching ? '刷新中…' : '刷新'}
        </button>
      </div>

      {data && (
        <div className="task-filters">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="all">全部项目</option>
            <option value="none">不归属项目</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <span className="runtime-list">
            {data.runtimes.length === 0 && <span className="muted">本机没有注册运行时</span>}
            {data.runtimes.map((r) => (
              <span key={r.id} className="runtime-chip" title={r.provider}>
                <span className={`dot ${r.online ? 'dot-clean' : 'dot-unavailable'}`} />
                {r.name}
              </span>
            ))}
          </span>
        </div>
      )}

      {overview.isPending && <p className="hint">从 multica 读取中…</p>}
      {overview.isError && !data && <MulticaError error={overview.error} />}

      {data && (
        <div className={`tasks-layout${issueId ? ' with-detail' : ''}`}>
          <div className="issue-board">
            {COLUMNS.map((col) => {
              const list = issues.filter((i) => col.statuses.includes(i.status))
              return (
                <section key={col.title} className="issue-column">
                  <div className="issue-column-head">
                    {col.title} <span className="muted">{list.length}</span>
                  </div>
                  {list.length === 0 && <p className="hint issue-empty">无</p>}
                  {list.map((i) => (
                    <IssueRow key={i.id} issue={i} selected={i.id === issueId} onClick={() => setIssueId(i.id)} />
                  ))}
                </section>
              )
            })}
          </div>
          {issueId && <IssuePanel key={issueId} issueId={issueId} projects={projects} onClose={() => setIssueId(null)} />}
        </div>
      )}
    </div>
  )
}
