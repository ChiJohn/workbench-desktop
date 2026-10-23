import type { Prefs } from '../../../shared/types'
import { startScript, stopScript, useSavePrefs, useScripts } from '../queries'
import { findRunning, useRuns } from '../stores/runs'

export function ScriptList({ projectId, prefs }: { projectId: string; prefs?: Prefs }) {
  const scripts = useScripts(projectId)
  const sessions = useRuns((s) => s.sessions)
  const setActive = useRuns((s) => s.setActive)
  const savePrefs = useSavePrefs()

  if (scripts.isLoading) return <p className="hint">读取 package.json…</p>
  if (scripts.error) return <p className="error-text">{scripts.error.message}</p>

  const entries = Object.entries(scripts.data?.scripts ?? {})
  if (entries.length === 0) return <p className="hint">package.json 中没有 scripts</p>

  const favorites = prefs?.repos[projectId]?.favoriteScripts ?? []
  const sorted = [
    ...entries.filter(([name]) => favorites.includes(name)),
    ...entries.filter(([name]) => !favorites.includes(name))
  ]

  const toggleFavorite = (name: string) => {
    const next = favorites.includes(name) ? favorites.filter((n) => n !== name) : [...favorites, name]
    savePrefs.mutate({ repos: { [projectId]: { favoriteScripts: next } } })
  }

  return (
    <div className="script-list">
      <div className="hint">包管理器：{scripts.data?.pm}</div>
      {sorted.map(([name, command]) => {
        const running = findRunning(sessions, projectId, name)
        const favorite = favorites.includes(name)
        return (
          <div key={name} className={`script-row${running ? ' running' : ''}`}>
            <button
              className={`icon-btn star${favorite ? ' on' : ''}`}
              title={favorite ? '取消常用' : '设为常用'}
              onClick={() => toggleFavorite(name)}
            >
              {favorite ? '★' : '☆'}
            </button>
            <span className="script-name mono">{name}</span>
            <span className="script-command mono" title={command}>
              {command}
            </span>
            {running ? (
              <>
                <button className="btn btn-small" onClick={() => setActive(running.runId)}>
                  日志
                </button>
                <button className="btn btn-small btn-danger" onClick={() => stopScript(running.runId)}>
                  停止
                </button>
              </>
            ) : (
              <button className="btn btn-small btn-primary" onClick={() => startScript(projectId, name)}>
                运行
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
