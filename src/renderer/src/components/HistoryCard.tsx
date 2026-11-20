import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { CommitFileChange } from '../../../shared/types'
import { api, unwrap } from '../api'
import { localTime } from '../format'
import { CollapsibleCard, useCardOpen } from './CollapsibleCard'
import { DiffView } from './DiffView'

const STATUS_LABEL: Record<string, string> = {
  A: '新增',
  M: '修改',
  D: '删除',
  R: '重命名',
  C: '复制',
  T: '类型',
  U: '未合并'
}

interface Props {
  projectId: string
  branch: string | null
}

export function HistoryCard({ projectId, branch }: Props) {
  const open = useCardOpen('history')
  const [refName, setRefName] = useState(branch ?? 'HEAD')
  const [authorDraft, setAuthorDraft] = useState('')
  const [author, setAuthor] = useState('')
  const [file, setFile] = useState<string | null>(null)
  const [openCommit, setOpenCommit] = useState<string | null>(null)
  const [diffCommit, setDiffCommit] = useState<string | null>(null)

  useEffect(() => {
    setRefName(branch ?? 'HEAD')
    setFile(null)
    setOpenCommit(null)
    setDiffCommit(null)
  }, [projectId, branch])

  useEffect(() => {
    const next = authorDraft.trim()
    const timer = setTimeout(() => setAuthor((prev) => (prev === next ? prev : next)), 300)
    return () => clearTimeout(timer)
  }, [authorDraft])

  useEffect(() => {
    setOpenCommit(null)
    setDiffCommit(null)
  }, [author, refName])

  const refs = useQuery({
    queryKey: ['gitHistoryRefs', projectId],
    queryFn: () => unwrap(api.git.historyRefs(projectId)),
    enabled: open,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false
  })

  const history = useInfiniteQuery({
    queryKey: ['gitHistory', projectId, refName, author, file ?? ''],
    queryFn: ({ pageParam }) =>
      unwrap(api.git.history(projectId, { ref: refName, author, path: file ?? undefined, skip: pageParam, limit: 40 })),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((count, page) => count + page.commits.length, 0) : undefined),
    enabled: open && Boolean(refName),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false
  })

  const files = useQuery({
    queryKey: ['gitCommitFiles', projectId, openCommit ?? ''],
    queryFn: () => unwrap(api.git.commitFiles(projectId, openCommit as string)),
    enabled: open && !file && Boolean(openCommit),
    retry: false
  })

  const diff = useQuery({
    queryKey: ['gitFileDiff', projectId, diffCommit ?? '', file ?? ''],
    queryFn: () => unwrap(api.git.fileDiff(projectId, diffCommit as string, file as string)),
    enabled: open && Boolean(file) && Boolean(diffCommit),
    retry: false
  })

  const local = refs.data?.local ?? []
  const remote = refs.data?.remote ?? []
  const listed = local.includes(refName) || remote.includes(refName)
  const localOptions = listed ? local : [refName, ...local]
  const commits = history.data?.pages.flatMap((page) => page.commits) ?? []

  const backToBranch = () => {
    setFile(null)
    setDiffCommit(null)
  }

  const chooseRef = (next: string) => {
    setRefName(next)
    setFile(null)
    setOpenCommit(null)
    setDiffCommit(null)
  }

  const openFile = (path: string) => {
    setFile(path)
    setOpenCommit(null)
    setDiffCommit(null)
  }

  return (
    <CollapsibleCard storageKey="history" title="提交历史">
      <div className="history-tools">
        <select className="repo-select" aria-label="查看分支" value={refName} onChange={(e) => chooseRef(e.target.value)}>
          {localOptions.length > 0 && (
            <optgroup label="本地">
              {localOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
          {remote.length > 0 && (
            <optgroup label="远程">
              {remote.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <input
          placeholder="按作者筛选"
          aria-label="按作者筛选"
          value={authorDraft}
          onChange={(e) => setAuthorDraft(e.target.value)}
        />
        {file && (
          <button className="btn btn-small btn-ghost" type="button" onClick={backToBranch}>
            返回分支历史
          </button>
        )}
      </div>
      {file && <p className="hint">文件 {file}</p>}
      {history.isPending && <p className="hint">读取提交…</p>}
      {history.isError && <p className="error-text">{history.error.message}</p>}
      {history.data && commits.length === 0 && <p className="muted">{author ? '没有这个作者的提交' : '还没有提交'}</p>}

      <div className="history-list">
        {commits.map((commit) => {
          const expanded = !file && openCommit === commit.hash
          const showingDiff = file !== null && diffCommit === commit.hash
          return (
            <div key={commit.hash} className="history-item">
              <button
                className={`history-row${expanded || showingDiff ? ' selected' : ''}`}
                type="button"
                onClick={() => (file ? setDiffCommit(showingDiff ? null : commit.hash) : setOpenCommit(expanded ? null : commit.hash))}
              >
                <span className="mono muted history-hash">{commit.short}</span>
                <span className="history-subject">{commit.subject}</span>
                <span className="muted history-author">{commit.author}</span>
                <span className="muted history-time">{localTime(commit.time)}</span>
              </button>
              {expanded && (
                <CommitFiles
                  files={files.data}
                  pending={files.isPending}
                  error={files.isError ? files.error.message : null}
                  onOpen={openFile}
                />
              )}
              {showingDiff && (
                <div className="change-diff-inline">
                  {diff.isPending ? <p className="hint">读取 diff…</p> : diff.isError ? <p className="error-text">{diff.error.message}</p> : <DiffView text={diff.data ?? ''} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {history.hasNextPage && (
        <button className="btn btn-small" type="button" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
          {history.isFetchingNextPage ? '加载中…' : '加载更多'}
        </button>
      )}
    </CollapsibleCard>
  )
}

function CommitFiles({
  files,
  pending,
  error,
  onOpen
}: {
  files?: CommitFileChange[]
  pending: boolean
  error: string | null
  onOpen(path: string): void
}) {
  if (pending) return <p className="hint">读取文件…</p>
  if (error) return <p className="error-text">{error}</p>
  if (!files?.length) return <p className="muted">这次提交没有碰到当前目录的文件。</p>
  return (
    <div className="history-files">
      {files.map((item) => (
        <button key={`${item.status}:${item.oldPath ?? ''}:${item.path}`} className="history-file" type="button" onClick={() => onOpen(item.path)}>
          <span className="mono history-status">{STATUS_LABEL[item.status] ?? item.status}</span>
          <span className="mono">
            {item.oldPath ? `${item.oldPath} → ${item.path}` : item.path}
          </span>
        </button>
      ))}
    </div>
  )
}
