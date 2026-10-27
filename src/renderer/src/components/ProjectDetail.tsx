import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { StatusMap } from '../../../shared/ipc'
import type { OpenerKind, Prefs, Project } from '../../../shared/types'
import { api, unwrap } from '../api'
import { relativeTime, TYPE_LABELS } from '../format'
import { openWith, qk, useGitAction, useSavePrefs } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { BranchSwitcher } from './BranchSwitcher'
import { ReleaseCard } from './ReleaseCard'
import { RepoAgentCard } from './RepoAgentCard'
import { ScriptList } from './ScriptList'

const OPENER_LABELS: Record<OpenerKind, string> = {
  cursor: 'Cursor IDE',
  terminal: '终端',
  explorer: '资源管理器',
  wechat: '微信开发者工具'
}

interface Props {
  project: Project
  status?: StatusMap
  prefs?: Prefs
}

export function ProjectDetail({ project, status, prefs }: Props) {
  const action = useGitAction()
  const savePrefs = useSavePrefs()
  const qc = useQueryClient()
  const setView = useUi((s) => s.setView)
  const openEditor = useUi((s) => s.openProjectEditor)
  const [newBranch, setNewBranch] = useState<string | null>(null)
  const repoPrefs = prefs?.repos[project.id] ?? {}
  const r = status?.[project.id]
  const openers: OpenerKind[] =
    project.type === 'miniapp' ? ['cursor', 'terminal', 'explorer', 'wechat'] : ['cursor', 'terminal', 'explorer']

  const submitBranch = (e: FormEvent) => {
    e.preventDefault()
    if (!newBranch?.trim()) return
    action.mutate({ kind: 'createBranch', id: project.id, branch: newBranch.trim() })
    setNewBranch(null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>{project.name}</h1>
        <span className="badge">{TYPE_LABELS[project.type]}</span>
        <button
          className={`icon-btn star${repoPrefs.pinned ? ' on' : ''}`}
          title={repoPrefs.pinned ? '取消置顶' : '置顶'}
          onClick={() => savePrefs.mutate({ repos: { [project.id]: { pinned: !repoPrefs.pinned } } })}
        >
          {repoPrefs.pinned ? '★' : '☆'}
        </button>
        <div className="header-actions">
          <button className="btn" type="button" onClick={() => openEditor({ mode: 'edit', id: project.id })}>
            编辑
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (!window.confirm(`移除「${project.name}」？\n只从 项目.md 删除这一行，代码和笔记都保留。`)) return
              void unwrap(api.project.remove(project.id))
                .then(async () => {
                  await qc.invalidateQueries({ queryKey: qk.registry })
                  setView({ kind: 'overview' })
                  toast.success('已移除')
                })
                .catch((e) => toast.error(e, '移除失败'))
            }}
          >
            移除
          </button>
        </div>
      </div>
      <div className="repo-path mono">{project.repoPath}</div>
      {project.note && <div className="hint">{project.note}</div>}

      {!project.available ? (
        <div className="card error-text">项目不可用：{project.unavailableReason}</div>
      ) : (
        <>
          <section className="card">
            <div className="status-line">
              {r?.ok ? (
                <>
                  <BranchSwitcher projectId={project.id} projectName={project.name} branch={r.data.branch} />
                  {r.data.upstream ? (
                    <span className="mono" title={r.data.upstream}>
                      ↑{r.data.ahead} <span className={r.data.behind ? 'error-text' : ''}>↓{r.data.behind}</span>
                    </span>
                  ) : (
                    <span className="muted">无上游</span>
                  )}
                  <span className={r.data.changes ? 'warn-text' : 'muted'}>改动 {r.data.changes}</span>
                </>
              ) : r && !r.ok ? (
                <span className="error-text" title={r.error.detail}>
                  {r.error.message}
                </span>
              ) : (
                <span className="muted">读取状态…</span>
              )}
            </div>
            {r?.ok && (
              <div className="last-commit">
                {r.data.lastCommit ? (
                  <>
                    <span className="mono muted">{r.data.lastCommit.hash}</span> {r.data.lastCommit.subject}
                    <span className="muted">（{relativeTime(r.data.lastCommit.timestamp)}）</span>
                  </>
                ) : (
                  <span className="muted">暂无提交</span>
                )}
              </div>
            )}

            <div className="button-row">
              {openers.map((o) => (
                <button key={o} className="btn" onClick={() => openWith(project.id, o)}>
                  {OPENER_LABELS[o]}
                </button>
              ))}
              <label className="inline-field">
                双击打开
                <select
                  value={repoPrefs.defaultOpener ?? 'cursor'}
                  onChange={(e) =>
                    savePrefs.mutate({ repos: { [project.id]: { defaultOpener: e.target.value as OpenerKind } } })
                  }
                >
                  {openers.map((o) => (
                    <option key={o} value={o}>
                      {OPENER_LABELS[o]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="button-row">
              <button
                className="btn"
                disabled={action.isPending}
                onClick={() => {
                  const branch = r?.ok ? (r.data.branch ?? '(detached)') : '当前分支'
                  if (window.confirm(`确认 pull？\n\n项目：${project.name}\n分支：${branch}（仅快进合并）`)) {
                    action.mutate({ kind: 'pull', id: project.id })
                  }
                }}
              >
                pull
              </button>
              <button
                className="btn"
                disabled={action.isPending}
                onClick={() => action.mutate({ kind: 'fetch', id: project.id })}
              >
                fetch
              </button>
              {newBranch === null ? (
                <button className="btn" disabled={action.isPending} onClick={() => setNewBranch('')}>
                  新建分支
                </button>
              ) : (
                <form className="inline-form" onSubmit={submitBranch}>
                  <input
                    autoFocus
                    className="mono"
                    placeholder="feature/xxx"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setNewBranch(null)}
                  />
                  <button className="btn btn-primary" type="submit">
                    创建并切换
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setNewBranch(null)}>
                    取消
                  </button>
                </form>
              )}
              {action.isPending && <span className="hint">执行中…</span>}
            </div>

            {project.type === 'miniapp' && (
              <label className="inline-field wide">
                小程序根目录
                <input
                  className="mono"
                  placeholder="留空则自动查找 project.config.json"
                  defaultValue={repoPrefs.miniprogramRoot ?? ''}
                  key={project.id}
                  onBlur={(e) => {
                    const value = e.target.value.trim() || undefined
                    if (value !== repoPrefs.miniprogramRoot) {
                      savePrefs.mutate({ repos: { [project.id]: { miniprogramRoot: value } } })
                    }
                  }}
                />
              </label>
            )}
          </section>

          {project.type === 'miniapp' && (
            <section className="card">
              <h2>小程序发版</h2>
              <ReleaseCard key={project.id} project={project} prefs={prefs} />
            </section>
          )}

          <section className="card">
            <h2>脚本</h2>
            <ScriptList projectId={project.id} prefs={prefs} />
          </section>

          <RepoAgentCard project={project} />
        </>
      )}
    </div>
  )
}
