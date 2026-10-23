import { useMemo } from 'react'
import type { StatusMap } from '../../../shared/ipc'
import type { Prefs, Project } from '../../../shared/types'
import { healthOf, TYPE_LABELS, TYPE_ORDER } from '../format'
import { openWith } from '../queries'
import { useRuns } from '../stores/runs'
import { useUi } from '../stores/ui'
import { StatusDot } from './StatusDot'

interface Props {
  projects: Project[]
  status?: StatusMap
  prefs?: Prefs
}

export function ProjectList({ projects, status, prefs }: Props) {
  const search = useUi((s) => s.search)
  const setSearch = useUi((s) => s.setSearch)
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const sessions = useRuns((s) => s.sessions)

  const runningProjects = useMemo(
    () => new Set(Object.values(sessions).filter((s) => s.status === 'running').map((s) => s.projectId)),
    [sessions]
  )

  const groups = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const matched = projects.filter(
      (p) => !keyword || p.name.toLowerCase().includes(keyword) || p.repoPath.toLowerCase().includes(keyword)
    )
    const pinned = matched.filter((p) => prefs?.repos[p.id]?.pinned)
    const rest = matched.filter((p) => !prefs?.repos[p.id]?.pinned)
    return [
      { key: 'pinned', label: '★ 置顶', items: pinned },
      ...TYPE_ORDER.map((t) => ({ key: t, label: TYPE_LABELS[t], items: rest.filter((p) => p.type === t) }))
    ].filter((g) => g.items.length > 0)
  }, [projects, prefs, search])

  const selectedId = view.kind === 'project' ? view.id : null

  return (
    <aside className="sidebar">
      <input
        className="search"
        placeholder="搜索项目 / 路径"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="project-groups">
        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="group-title">{g.label}</h3>
            {g.items.map((p) => (
              <button
                key={p.id}
                className={`project-item${p.id === selectedId ? ' selected' : ''}${p.available ? '' : ' muted'}`}
                title={p.available ? p.repoPath : `${p.repoPath}（${p.unavailableReason}）`}
                onClick={() => setView({ kind: 'project', id: p.id })}
                onDoubleClick={() => p.available && openWith(p.id, prefs?.repos[p.id]?.defaultOpener ?? 'cursor')}
              >
                <span className="project-name">{p.name}</span>
                {runningProjects.has(p.id) && <span className="running-mark" title="有脚本运行中">▶</span>}
                <StatusDot health={healthOf(p, status?.[p.id])} />
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className="hint">没有匹配的项目</p>}
      </div>
    </aside>
  )
}
