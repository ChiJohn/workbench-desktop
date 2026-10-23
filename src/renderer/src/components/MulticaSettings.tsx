import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { MulticaPrefs, MulticaProject, Project } from '../../../shared/types'
import { refreshMultica, useMulticaOverview, useSavePrefs } from '../queries'
import { RepoSelect } from './TasksPage'

const MATCH_LABELS: Record<NonNullable<MulticaProject['matchedBy']>, string> = {
  manual: '手工',
  path: '按路径',
  name: '按名称'
}

export function MulticaSettings({ prefs, projects }: { prefs: MulticaPrefs; projects: Project[] }) {
  const qc = useQueryClient()
  const overview = useMulticaOverview()
  const save = useSavePrefs()
  const [cliPath, setCliPath] = useState(prefs.cliPath ?? '')
  const [profile, setProfile] = useState(prefs.profile ?? '')

  const patch = (p: MulticaPrefs) => save.mutate({ multica: p }, { onSuccess: () => refreshMultica(qc, true) })
  const data = overview.data

  return (
    <section className="card form">
      <h2>multica</h2>
      <p>
        连接：
        {overview.isPending ? (
          <span className="muted">检测中…</span>
        ) : data ? (
          <span>
            已连接 {data.workspace.name}
            <span className="muted">
              （{data.agents.length} 个智能体，{data.projects.length} 个项目）
            </span>
          </span>
        ) : (
          <span className="error-text">{overview.error?.message}</span>
        )}
      </p>
      {data && (
        <label>
          <span>工作区</span>
          <select value={data.workspace.id} disabled={save.isPending} onChange={(e) => patch({ workspaceId: e.target.value })}>
            {data.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span>CLI 路径（可选）</span>
        <input
          className="mono"
          placeholder="留空则用桌面端自带的 multica.exe，其次 PATH"
          value={cliPath}
          onChange={(e) => setCliPath(e.target.value)}
          onBlur={() => cliPath.trim() !== (prefs.cliPath ?? '') && patch({ cliPath: cliPath.trim() || undefined })}
        />
      </label>
      <label>
        <span>profile（可选）</span>
        <input
          className="mono"
          placeholder="留空则用桌面端的 desktop-* profile"
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          onBlur={() => profile.trim() !== (prefs.profile ?? '') && patch({ profile: profile.trim() || undefined })}
        />
        <small>复用桌面端的登录信息，令牌不经过工作台</small>
      </label>

      {data && data.projects.length > 0 && (
        <>
          <h3>项目对应</h3>
          <table className="table compact">
            <thead>
              <tr>
                <th>multica 项目</th>
                <th>仓库</th>
                <th>方式</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>
                    <RepoSelect value={p.repoId ?? undefined} projects={projects} onChange={(id) => patch({ projectMap: { [p.id]: id } })} />
                  </td>
                  <td className="muted">{p.matchedBy ? MATCH_LABELS[p.matchedBy] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <small className="hint">自动对应：项目描述里的仓库目录，其次项目名等于 vault 项目目录名；手工选择优先，选「未关联仓库」恢复自动</small>
        </>
      )}
    </section>
  )
}
