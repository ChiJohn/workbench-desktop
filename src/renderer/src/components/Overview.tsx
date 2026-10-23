import type { StatusMap } from '../../../shared/ipc'
import type { Project } from '../../../shared/types'
import { healthOf, relativeTime, TYPE_LABELS } from '../format'
import { useUi } from '../stores/ui'
import { StatusDot } from './StatusDot'

interface Props {
  projects: Project[]
  status?: StatusMap
  loading: boolean
}

export function Overview({ projects, status, loading }: Props) {
  const setView = useUi((s) => s.setView)

  return (
    <div className="page">
      <div className="page-header">
        <h1>总览</h1>
        <span className="hint">
          {projects.length} 个项目{loading ? ' · 正在刷新状态…' : ''}
        </span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>项目</th>
            <th>类型</th>
            <th>分支</th>
            <th className="num">改动</th>
            <th className="num">↑ / ↓</th>
            <th>最近提交</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const r = status?.[p.id]
            return (
              <tr key={p.id} onClick={() => setView({ kind: 'project', id: p.id })}>
                <td>
                  <StatusDot health={healthOf(p, r)} />
                </td>
                <td className="strong">{p.name}</td>
                <td>{TYPE_LABELS[p.type]}</td>
                {!p.available ? (
                  <td colSpan={4} className="muted">
                    {p.unavailableReason}
                  </td>
                ) : !r ? (
                  <td colSpan={4} className="muted">
                    …
                  </td>
                ) : !r.ok ? (
                  <td colSpan={4} className="error-text" title={r.error.detail}>
                    {r.error.message}
                  </td>
                ) : (
                  <>
                    <td className="mono branch" title={r.data.branch ?? undefined}>
                      {r.data.branch ?? '(detached)'}
                    </td>
                    <td className={`num${r.data.changes ? ' warn-text' : ''}`}>{r.data.changes || '-'}</td>
                    <td className="num mono">
                      {r.data.upstream ? (
                        <>
                          {r.data.ahead} / <span className={r.data.behind ? 'error-text' : ''}>{r.data.behind}</span>
                        </>
                      ) : (
                        <span className="muted">无上游</span>
                      )}
                    </td>
                    <td className="ellipsis" title={r.data.lastCommit?.subject}>
                      {r.data.lastCommit ? (
                        <>
                          <span className="muted">{relativeTime(r.data.lastCommit.timestamp)}</span>{' '}
                          {r.data.lastCommit.subject}
                        </>
                      ) : (
                        <span className="muted">暂无提交</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
