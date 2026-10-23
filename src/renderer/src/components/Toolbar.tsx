import { useQueryClient } from '@tanstack/react-query'
import type { Project } from '../../../shared/types'
import { qk, useFetchAll } from '../queries'
import { useUi } from '../stores/ui'

export function Toolbar({ projects, taskCount }: { projects: Project[]; taskCount?: number }) {
  const qc = useQueryClient()
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const fetchAll = useFetchAll(projects)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.registry })
    qc.invalidateQueries({ queryKey: qk.status })
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">&gt;_</span>
        Workbench
      </div>
      <nav className="toolbar-actions">
        <button
          className={view.kind === 'overview' ? 'btn btn-ghost active' : 'btn btn-ghost'}
          onClick={() => setView({ kind: 'overview' })}
        >
          总览
        </button>
        <button
          className={view.kind === 'tasks' ? 'btn btn-ghost active' : 'btn btn-ghost'}
          onClick={() => setView({ kind: 'tasks' })}
        >
          任务
          {taskCount !== undefined && taskCount > 0 && <span className="count-badge">{taskCount}</span>}
        </button>
        <button className="btn" disabled={fetchAll.isPending} onClick={() => fetchAll.mutate()}>
          {fetchAll.isPending ? '正在 fetch…' : '全部 fetch'}
        </button>
        <button className="btn" onClick={refresh}>
          刷新
        </button>
      </nav>
      <button
        className={view.kind === 'settings' ? 'btn btn-ghost active' : 'btn btn-ghost'}
        onClick={() => setView({ kind: 'settings' })}
      >
        设置
      </button>
    </header>
  )
}
