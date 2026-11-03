import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { MulticaCommitRequest, MulticaIssue, Project, ReportWriter } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk, refreshMultica, refreshStatus, useGitChanges, useGitDiff } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { DiffView } from './DiffView'
import { WRITER_OPTIONS } from './ReportsPage'
import { loadCommitWriter, saveCommitWriter } from './WorktreeCard'

export function ReviewSection({ issue, repo }: { issue: MulticaIssue; repo: Project }) {
  const qc = useQueryClient()
  const changes = useGitChanges(repo.id)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const diff = useGitDiff(repo.id, viewing)
  const [feedback, setFeedback] = useState('')
  const [commitMsg, setCommitMsg] = useState<string | null>(null)
  const [writer, setWriter] = useState<ReportWriter>(loadCommitWriter)
  const [busy, setBusy] = useState(false)
  const [generatingMsg, setGeneratingMsg] = useState(false)

  const files = changes.data ?? []
  useEffect(() => {
    if (changes.data && selected === null) setSelected(new Set(changes.data.map((c) => c.path)))
  }, [changes.data, selected])
  const chosen = files.filter((f) => selected?.has(f.path)).map((f) => f.path)
  const impact = useQuery({
    queryKey: qk.uaDiffImpact(repo.id, chosen),
    queryFn: () => unwrap(api.ua.diffImpact(repo.id, chosen)),
    enabled: chosen.length > 0,
    retry: false
  })

  const toggle = (path: string) => {
    const next = new Set(selected ?? [])
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelected(next)
  }

  const afterChange = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.multicaIssue(issue.id) }),
      qc.invalidateQueries({ queryKey: qk.gitChanges(repo.id) }),
      qc.invalidateQueries({ queryKey: ['gitDiff', repo.id] }),
      refreshMultica(qc, false),
      refreshStatus(qc, repo.id)
    ])
  }

  const sendBack = async () => {
    setBusy(true)
    try {
      await unwrap(api.multica.comment(issue.id, feedback))
      toast.success('已打回', issue.assigneeType === 'agent' ? `已 @${issue.assigneeName}` : undefined)
      setFeedback('')
      await afterChange()
    } catch (e) {
      toast.error(e, '打回失败')
    }
    setBusy(false)
  }

  const discardFile = async (path: string) => {
    if (busy) return
    if (!window.confirm(`确认放弃对「${path}」的本地修改？\n此操作不可恢复。`)) return
    setBusy(true)
    try {
      await unwrap(api.git.discard(repo.id, [path]))
      toast.success(`已撤销 ${path}`)
      if (viewing === path) setViewing(null)
      await afterChange()
    } catch (e) {
      toast.error(e, '撤销改动失败')
    }
    setBusy(false)
  }

  const complete = async (commit: MulticaCommitRequest | null) => {
    setBusy(true)
    try {
      const r = await unwrap(api.multica.complete(issue.id, commit))
      toast.success(r.commit ? `已提交 ${r.commit} 并标为完成` : '已标为完成', r.card ?? undefined)
      if (r.card) useUi.getState().offerDeposit({ task: r.card, title: issue.title, project: repo.name })
      if (r.warning) toast.failure(r.warning)
      setCommitMsg(null)
      await afterChange()
    } catch (e) {
      toast.error(e, commit ? '提交失败，未修改 multica 状态' : '标记完成失败')
    }
    setBusy(false)
  }

  return (
    <div className="review">
      <h3>审查</h3>
      <p className="hint">智能体直接修改工作区，下面的改动可能包含其他任务或手工修改，提交前请逐个确认。</p>
      {changes.isPending && <p className="hint">读取改动…</p>}
      {changes.isError && <p className="error-text">{changes.error.message}</p>}
      {changes.data && files.length === 0 && <p className="muted">工作区没有改动。</p>}
      {files.length > 0 && (
        <div className="change-list">
          {files.map((f) => {
            const isOpen = viewing === f.path
            return (
              <div key={f.path} className="change-item">
                <div
                  className={`change-row${isOpen ? ' selected' : ''}`}
                  onClick={() => setViewing(isOpen ? null : f.path)}
                >
                  <input
                    type="checkbox"
                    checked={selected?.has(f.path) ?? false}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggle(f.path)}
                  />
                  <span className="card-arrow muted">{isOpen ? '▾' : '▸'}</span>
                  <span className="mono change-code">{f.code.replace(/ /g, '·')}</span>
                  <span className="mono change-path" title={f.path}>
                    {f.path}
                  </span>
                  <button
                    className="btn btn-small btn-ghost"
                    type="button"
                    disabled={busy}
                    title="放弃该文件的本地修改"
                    onClick={(e) => {
                      e.stopPropagation()
                      void discardFile(f.path)
                    }}
                  >
                    撤销
                  </button>
                </div>
                {isOpen && (
                  <div className="change-diff-inline">
                    {diff.isPending ? (
                      <p className="hint">读取 diff…</p>
                    ) : diff.isError ? (
                      <p className="error-text">{diff.error.message}</p>
                    ) : (
                      <DiffView text={diff.data ?? ''} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {impact.data && (
        <div className="ua-impact">
          <p className="hint">
            UA 影响面（<span className="mono">{impact.data.graphRel}</span>）：勾选的改动匹配图谱{' '}
            {impact.data.matchedFiles.length} 个文件
            {impact.data.untrackedFiles.length > 0 && `，${impact.data.untrackedFiles.length} 个新文件尚未入图谱`}
            {impact.data.impacted.length > 0
              ? `，波及 ${impact.data.impacted.length} 个上下游模块：`
              : '，未发现跨文件图谱依赖波及。'}
          </p>
          {impact.data.impacted.length > 0 && (
            <div className="change-list">
              {impact.data.impacted.map((item) => (
                <div key={item.id} className="ua-impact-row" title={item.summary || item.name}>
                  <span
                    className={`task-status ${item.relation === 'caller' ? 'st-doing' : 'st-todo'}`}
                    title={item.edgeTypes.join(', ')}
                  >
                    {item.relation === 'caller' ? '调用方' : '依赖方'}
                  </span>
                  <span className="mono">{item.filePath ?? item.name}</span>
                  {item.summary && <span className="muted ua-impact-summary">{item.summary}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <textarea
        className="review-input"
        rows={3}
        placeholder={issue.assigneeType === 'agent' ? `打回意见，会自动 @${issue.assigneeName}` : '打回意见'}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <div className="button-row wrap">
        <button className="btn" disabled={busy || !feedback.trim()} onClick={sendBack}>
          打回
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => window.confirm(`把 ${issue.identifier} 标为完成？不会提交代码。`) && complete(null)}
        >
          通过
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || chosen.length === 0}
          title={chosen.length ? undefined : '先勾选要提交的文件'}
          onClick={() => setCommitMsg(`feat: ${issue.title}\n\nmultica: ${issue.identifier}`)}
        >
          通过并提交
        </button>
      </div>

      {commitMsg !== null && (
        <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && !busy && setCommitMsg(null)}>
          <div className="modal form" onKeyDown={(e) => e.key === 'Escape' && !busy && setCommitMsg(null)}>
            <h2>确认提交并完成</h2>
            <dl className="confirm-list">
              <dt>仓库</dt>
              <dd>{repo.name}</dd>
              <dt>任务</dt>
              <dd>
                {issue.identifier} {issue.title}
              </dd>
            </dl>
            <h3>提交 {chosen.length} 个文件</h3>
            <div className="commit-files mono">
              {chosen.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </div>
            <label>
              <div className="page-header">
                <span>提交信息</span>
                <div className="header-actions">
                  <select
                    value={writer}
                    disabled={busy || generatingMsg}
                    title="选择生成提交信息的 AI 工具"
                    onChange={(e) => {
                      const next = e.target.value as ReportWriter
                      setWriter(next)
                      saveCommitWriter(next)
                    }}
                  >
                    {WRITER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-small"
                    type="button"
                    disabled={busy || generatingMsg || chosen.length === 0}
                    onClick={async () => {
                      setGeneratingMsg(true)
                      try {
                        const msg = await unwrap(api.git.generateCommitMsg(repo.id, chosen, writer))
                        setCommitMsg(`${msg}\n\nmultica: ${issue.identifier}`)
                      } catch (e) {
                        toast.error(e, 'AI 生成提交信息失败')
                      } finally {
                        setGeneratingMsg(false)
                      }
                    }}
                  >
                    {generatingMsg ? 'AI 生成中…' : 'AI 生成'}
                  </button>
                </div>
              </div>
              <textarea className="mono" rows={4} value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} />
            </label>
            <p className="hint">只 commit 不 push；提交成功后把任务标为完成并回填任务卡。</p>
            <div className="button-row">
              <button
                autoFocus
                className="btn btn-primary"
                disabled={busy || !commitMsg.trim()}
                onClick={() => complete({ files: chosen, message: commitMsg.trim() })}
              >
                {busy ? '提交中…' : '确认提交'}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setCommitMsg(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
