import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { MulticaCommitRequest, MulticaIssue, Project } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk, refreshMultica, refreshStatus, useGitChanges, useGitDiff } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'

function DiffView({ text }: { text: string }) {
  return (
    <pre className="diff-view">
      {text.split('\n').map((line, i) => {
        const cls =
          line.startsWith('+++') || line.startsWith('---')
            ? 'muted'
            : line.startsWith('+')
              ? 'diff-add'
              : line.startsWith('-')
                ? 'diff-del'
                : line.startsWith('@@')
                  ? 'diff-hunk'
                  : undefined
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

export function ReviewSection({ issue, repo }: { issue: MulticaIssue; repo: Project }) {
  const qc = useQueryClient()
  const changes = useGitChanges(repo.id)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const diff = useGitDiff(repo.id, viewing)
  const [feedback, setFeedback] = useState('')
  const [commitMsg, setCommitMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const files = changes.data ?? []
  useEffect(() => {
    if (changes.data && selected === null) setSelected(new Set(changes.data.map((c) => c.path)))
  }, [changes.data, selected])
  const chosen = files.filter((f) => selected?.has(f.path)).map((f) => f.path)

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
          {files.map((f) => (
            <div key={f.path} className={`change-row${viewing === f.path ? ' selected' : ''}`}>
              <input type="checkbox" checked={selected?.has(f.path) ?? false} onChange={() => toggle(f.path)} />
              <span className="mono change-code">{f.code.replace(/ /g, '·')}</span>
              <span className="mono change-path" title={f.path} onClick={() => setViewing(viewing === f.path ? null : f.path)}>
                {f.path}
              </span>
            </div>
          ))}
        </div>
      )}
      {viewing &&
        (diff.isPending ? (
          <p className="hint">读取 diff…</p>
        ) : diff.isError ? (
          <p className="error-text">{diff.error.message}</p>
        ) : (
          <DiffView text={diff.data ?? ''} />
        ))}

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
              <span>提交信息</span>
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
