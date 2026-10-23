import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Project } from '../../../shared/types'
import { api, unwrap } from '../api'
import { localTime } from '../format'
import { qk, useMulticaIssue } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { ISSUE_STATUS_LABELS } from './AgentsPage'
import { ReviewSection } from './ReviewSection'

interface Props {
  issueId: string
  projects: Project[]
  onClose(): void
}

export function IssuePanel({ issueId, projects, onClose }: Props) {
  const qc = useQueryClient()
  const detail = useMulticaIssue(issueId)
  const setView = useUi((s) => s.setView)
  const [busy, setBusy] = useState(false)
  const [descOpen, setDescOpen] = useState(false)

  const head = (identifier?: string) => (
    <div className="task-detail-head">
      <span className="muted mono">{identifier ?? issueId.slice(0, 8)}</span>
      <span className="spacer" />
      <button className="icon-btn" title="关闭" onClick={onClose}>
        ×
      </button>
    </div>
  )
  if (detail.isPending) return <aside className="task-detail">{head()}<p className="hint">读取详情…</p></aside>
  if (detail.isError) {
    return (
      <aside className="task-detail">
        {head()}
        <p className="error-text">{detail.error.message}</p>
      </aside>
    )
  }

  const { issue, description, comments, conclusion, card } = detail.data
  const repo = projects.find((p) => p.id === issue.repoId && p.available)

  const backfill = async () => {
    setBusy(true)
    try {
      const rel = await unwrap(api.multica.backfill(issue.id))
      toast.success('任务卡已回填', rel)
      await qc.invalidateQueries({ queryKey: qk.multicaIssue(issue.id) })
    } catch (e) {
      toast.error(e, '回填失败')
    }
    setBusy(false)
  }

  const openCard = async () => {
    if (!card) return
    try {
      await unwrap(api.tapd.openCard(card))
    } catch (e) {
      toast.error(e, '打开任务卡失败')
    }
  }

  return (
    <aside className="task-detail">
      {head(issue.identifier)}
      <h2 className="task-detail-title">{issue.title}</h2>
      <dl className="confirm-list">
        <dt>状态</dt>
        <dd>{ISSUE_STATUS_LABELS[issue.status] ?? issue.status}</dd>
        <dt>负责人</dt>
        <dd>{issue.assigneeName ?? '未指派'}</dd>
        <dt>项目</dt>
        <dd>{issue.projectTitle ?? '不归属项目'}</dd>
        <dt>仓库</dt>
        <dd>{repo ? repo.name : <span className="muted">未对应（在设置里映射 multica 项目）</span>}</dd>
        {issue.tapdKey && (
          <>
            <dt>TAPD</dt>
            <dd className="mono">{issue.tapdKey}</dd>
          </>
        )}
        <dt>更新</dt>
        <dd className="mono">{localTime(issue.updatedAt, true)}</dd>
      </dl>

      <div className="button-row wrap">
        <button className="btn" onClick={() => api.app.openExternal(issue.url)}>
          在 multica 打开
        </button>
        <button className="btn" disabled={!repo} onClick={() => repo && setView({ kind: 'project', id: repo.id })}>
          去仓库
        </button>
        {card ? (
          <button className="btn" onClick={openCard} title={card}>
            在 Obsidian 打开
          </button>
        ) : (
          issue.status === 'done' && (
            <button className="btn" disabled={!repo || busy} title={repo ? undefined : '任务没有对应仓库'} onClick={backfill}>
              {busy ? '回填中…' : '回填任务卡'}
            </button>
          )
        )}
      </div>

      <h3>智能体结论</h3>
      <div className="task-desc">{conclusion ?? <span className="muted">（智能体还没有评论）</span>}</div>

      {issue.status === 'in_review' &&
        (repo ? (
          <ReviewSection issue={issue} repo={repo} />
        ) : (
          <p className="hint">任务没有对应仓库，无法在这里审查；可以去设置里映射 multica 项目。</p>
        ))}

      <h3 className="clickable" onClick={() => setDescOpen(!descOpen)}>
        {descOpen ? '▾' : '▸'} 描述
      </h3>
      {descOpen && <div className="task-desc">{description || <span className="muted">（无描述）</span>}</div>}

      {comments.length > 0 && (
        <>
          <h3>评论 {comments.length}</h3>
          <div className="comment-list">
            {comments.map((c) => (
              <div key={c.id} className="comment">
                <div className="muted">
                  {c.authorName} · <span className="mono">{localTime(c.createdAt)}</span>
                </div>
                <div className="task-desc">{c.content}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
