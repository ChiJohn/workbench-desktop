import type { Project } from '../../../shared/types'
import { useMulticaOverview } from '../queries'
import { useUi } from '../stores/ui'
import { ISSUE_STATUS_LABELS, IssueRow } from './AgentsPage'

const STATUS_ORDER = ['in_review', 'in_progress', 'blocked', 'todo', 'backlog']

export function RepoAgentCard({ project }: { project: Project }) {
  const overview = useMulticaOverview()
  const openIssue = useUi((s) => s.openIssue)
  const setView = useUi((s) => s.setView)

  const body = () => {
    if (overview.isPending) return <p className="hint">从 multica 读取中…</p>
    if (!overview.data) return <p className="muted">multica 不可用：{overview.error?.message}</p>
    const linked = overview.data.projects.filter((p) => p.repoId === project.id)
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
    const ids = new Set(linked.map((p) => p.id))
    const issues = overview.data.issues
      .filter((i) => i.projectId && ids.has(i.projectId))
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
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
    <section className="card">
      <h2>智能体任务</h2>
      {body()}
    </section>
  )
}
