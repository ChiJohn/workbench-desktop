import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReportWriter } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk, refreshStatus, useGitChanges, useGitDiff, useGitStashes } from '../queries'
import { toast } from '../stores/toast'
import { CollapsibleCard, useCardOpen } from './CollapsibleCard'
import { DiffView } from './DiffView'
import { WRITER_OPTIONS } from './ReportsPage'

const COMMIT_WRITER_KEY = 'wb.commitWriter'

export function loadCommitWriter(): ReportWriter {
  try {
    const saved = localStorage.getItem(COMMIT_WRITER_KEY)
    return saved === 'cursor' || saved === 'codex' ? saved : 'claude'
  } catch {
    return 'claude'
  }
}

export function saveCommitWriter(writer: ReportWriter): void {
  try {
    localStorage.setItem(COMMIT_WRITER_KEY, writer)
  } catch {
    // ignore
  }
}

interface Props {
  projectId: string
  changeCount?: number
}

export function WorktreeCard({ projectId, changeCount }: Props) {
  const qc = useQueryClient()
  const open = useCardOpen('worktree')
  const changes = useGitChanges(open ? projectId : null)
  const stashes = useGitStashes(projectId, open)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const diff = useGitDiff(projectId, open ? viewing : null)
  const [commitMsg, setCommitMsg] = useState('')
  const [writer, setWriter] = useState<ReportWriter>(loadCommitWriter)
  const [stashNote, setStashNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [generatingMsg, setGeneratingMsg] = useState(false)

  const files = changes.data ?? []
  const stashList = stashes.data ?? []

  useEffect(() => {
    if (!changes.data) return
    setSelected((prev) => {
      if (prev === null) return new Set(changes.data.map((c) => c.path))
      const valid = new Set(changes.data.map((c) => c.path))
      return new Set([...prev].filter((p) => valid.has(p)))
    })
    setViewing((prev) => (prev && changes.data.some((c) => c.path === prev) ? prev : null))
  }, [changes.data])

  const chosen = files.filter((f) => selected?.has(f.path)).map((f) => f.path)
  const allSelected = files.length > 0 && chosen.length === files.length
  const visibleCount = changes.data ? files.length : (changeCount ?? 0)

  const toggleFile = (path: string) => {
    const next = new Set(selected ?? [])
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelected(next)
  }

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(files.map((f) => f.path)))
  }

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.gitChanges(projectId) }),
      qc.invalidateQueries({ queryKey: qk.gitStashes(projectId) }),
      qc.invalidateQueries({ queryKey: ['gitDiff', projectId] }),
      refreshStatus(qc, projectId)
    ])
  }

  const generateAiCommitMsg = async () => {
    if (generatingMsg || busy || chosen.length === 0) return
    setGeneratingMsg(true)
    try {
      const msg = await unwrap(api.git.generateCommitMsg(projectId, chosen, writer))
      setCommitMsg(msg)
      toast.success('已生成提交信息，确认后可提交')
    } catch (err) {
      toast.error(err, 'AI 生成提交信息失败')
    } finally {
      setGeneratingMsg(false)
    }
  }

  const submitCommit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy || generatingMsg || chosen.length === 0 || !commitMsg.trim()) return
    setBusy(true)
    try {
      const hash = await unwrap(api.git.commit(projectId, chosen, commitMsg.trim()))
      toast.success(`已提交 ${hash}（${chosen.length} 个文件）`)
      setCommitMsg('')
      setViewing(null)
      setSelected(null)
      await refreshAll()
    } catch (err) {
      toast.error(err, '提交失败')
    } finally {
      setBusy(false)
    }
  }

  const doStashPush = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy || files.length === 0) return
    setBusy(true)
    try {
      await unwrap(api.git.stashPush(projectId, stashNote?.trim() || undefined))
      toast.success('已贮藏当前工作区改动')
      setStashNote(null)
      setViewing(null)
      setSelected(null)
      await refreshAll()
    } catch (err) {
      toast.error(err, '贮藏失败')
    } finally {
      setBusy(false)
    }
  }

  const doStashPop = async (index: number, ref: string) => {
    if (busy) return
    setBusy(true)
    try {
      await unwrap(api.git.stashPop(projectId, index))
      toast.success(`已弹出 ${ref}`)
      setSelected(null)
      await refreshAll()
    } catch (err) {
      toast.error(err, `弹出 ${ref} 失败`)
      await refreshAll()
    } finally {
      setBusy(false)
    }
  }

  const doStashDrop = async (index: number, ref: string, msg: string) => {
    if (busy) return
    if (!window.confirm(`确认丢弃贮藏 ${ref}？\n\n${msg}\n丢弃后无法恢复。`)) return
    setBusy(true)
    try {
      await unwrap(api.git.stashDrop(projectId, index))
      toast.success(`已丢弃 ${ref}`)
      await qc.invalidateQueries({ queryKey: qk.gitStashes(projectId) })
    } catch (err) {
      toast.error(err, '丢弃贮藏失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CollapsibleCard
      storageKey="worktree"
      title="本地改动与贮藏"
      badges={
        <>
          {visibleCount > 0 && <span className="task-status st-doing">改动 {visibleCount}</span>}
          {stashList.length > 0 && <span className="task-status st-todo">贮藏 {stashList.length}</span>}
        </>
      }
      actions={
        <>
          {files.length > 0 && (
            <button className="btn btn-small btn-ghost" type="button" onClick={toggleAll}>
              {allSelected ? '取消全选' : '全选'}
            </button>
          )}
          <button
            className="btn btn-small"
            type="button"
            disabled={changes.isFetching || stashes.isFetching}
            onClick={() => void refreshAll()}
          >
            {changes.isFetching ? '刷新中…' : '刷新'}
          </button>
        </>
      }
    >
      {changes.isPending && <p className="hint">读取本地改动…</p>}
      {changes.isError && <p className="error-text">{changes.error.message}</p>}
      {changes.data && files.length === 0 && <p className="muted">工作区干净，没有未提交的改动。</p>}

      {files.length > 0 && (
        <>
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
                      onChange={() => toggleFile(f.path)}
                    />
                    <span className="card-arrow muted">{isOpen ? '▾' : '▸'}</span>
                    <span className="mono change-code">{f.code.replace(/ /g, '·')}</span>
                    <span className="mono change-path" title="点击展开或收起 diff">
                      {f.path}
                    </span>
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

          <form className="worktree-commit-row" onSubmit={(e) => void submitCommit(e)}>
            <textarea
              className="worktree-commit-input"
              rows={commitMsg.includes('\n') ? 3 : 1}
              value={commitMsg}
              disabled={busy || generatingMsg}
              placeholder="输入提交信息，或点右侧「AI 生成」自动根据勾选文件预填（只 commit 不 push）"
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (!e.shiftKey && !commitMsg.includes('\n')))) {
                  e.preventDefault()
                  void submitCommit()
                }
              }}
            />
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
              className="btn"
              type="button"
              disabled={busy || generatingMsg || chosen.length === 0}
              title={chosen.length === 0 ? '请先勾选要提交的文件' : '根据勾选文件的 diff 自动生成提交信息'}
              onClick={() => void generateAiCommitMsg()}
            >
              {generatingMsg ? 'AI 生成中…' : 'AI 生成'}
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || generatingMsg || chosen.length === 0 || !commitMsg.trim()}
            >
              {busy ? '处理中…' : `提交选中 (${chosen.length})`}
            </button>
            {stashNote === null ? (
              <button className="btn" type="button" disabled={busy || generatingMsg} onClick={() => setStashNote('')}>
                贮藏全部
              </button>
            ) : null}
          </form>

          {stashNote !== null && (
            <form className="worktree-commit-row" onSubmit={(e) => void doStashPush(e)}>
              <input
                autoFocus
                value={stashNote}
                disabled={busy}
                placeholder="可选贮藏备注（留空用默认 WIP 说明）"
                onChange={(e) => setStashNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setStashNote(null)}
              />
              <button className="btn btn-primary" type="submit" disabled={busy}>
                确认贮藏
              </button>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setStashNote(null)}>
                取消
              </button>
            </form>
          )}
        </>
      )}

      {stashList.length > 0 && (
        <div className="stash-section">
          <div className="hint">已贮藏（{stashList.length}）：</div>
          <div className="change-list">
            {stashList.map((s) => (
              <div key={s.ref} className="stash-row">
                <span className="mono muted">{s.ref}</span>
                <span className="stash-msg" title={s.message}>
                  {s.message}
                </span>
                <span className="muted">{s.age}</span>
                <button
                  className="btn btn-small"
                  type="button"
                  disabled={busy}
                  onClick={() => void doStashPop(s.index, s.ref)}
                >
                  弹出恢复
                </button>
                <button
                  className="btn btn-small btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void doStashDrop(s.index, s.ref, s.message)}
                >
                  丢弃
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </CollapsibleCard>
  )
}
