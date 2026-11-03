import type { Project } from '../../../shared/types'
import { useMulticaOverview } from '../queries'
import { useUi } from '../stores/ui'
import { ISSUE_STATUS_LABELS, IssueRow } from './AgentsPage'
import { CollapsibleCard } from './CollapsibleCard'

const STATUS_ORDER = ['in_review', 'in_progress', 'blocked', 'todo', 'backlog']

export function RepoAgentCard({ project }: { project: Project }) {
  const overview = useMulticaOverview()
  const openIssue = useUi((s) => s.openIssue)
  const setView = useUi((s) => s.setView)

  const linked = overview.data ? overview.data.projects.filter((p) => p.repoId === project.id) : []
  const linkedIds = new Set(linked.map((p) => p.id))
  const issues = overview.data
    ? overview.data.issues
        .filter((i) => i.projectId && linkedIds.has(i.projectId))
        .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    : []

  const body = () => {
    if (overview.isPending) return <p className="hint">从 multica 读取中…</p>
    if (!overview.data) return <p className="muted">multica 不可用：{overview.error?.message}</p>
    if (linked.length === 0) {
      return (
        <p className="hint">
          没有对应的 multica 项目。
          <button className="btn btn-small" onClick={() => setView({ kind: 'settings' })}>
            去设置映射
          </button>
        </p>
      )
    }
    return (
      <>
        <p className="muted">{linked.map((p) => p.title).join('、')}</p>
        {issues.length === 0 && <p className="muted">没有未完成的任务。</p>}
        {issues.map((i) => (
          <div key={i.id} className="repo-issue">
            <span className={`issue-status status-${i.status}`}>{ISSUE_STATUS_LABELS[i.status] ?? i.status}</span>
            <IssueRow issue={i} onClick={() => openIssue(i.id)} />
          </div>
        ))}
      </>
    )
  }

  return (
    <CollapsibleCard
      storageKey="agents"
      title="智能体任务"
      badges={issues.length > 0 ? <span className="badge">{issues.length}</span> : undefined}
    >
      {body()}
    </CollapsibleCard>
  )
}
