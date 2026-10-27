import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CnbBuild, CnbSummaryItem } from '../../../shared/types'
import { api, unwrap } from '../api'
import { formatDuration } from '../format'
import { qk } from '../queries'
import { toast } from '../stores/toast'

const STATUS_LABELS: Record<string, string> = {
  pending: '进行中',
  success: '成功',
  error: '失败',
  cancel: '已取消'
}

export function cnbStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? (status || '未知')
}

export function cnbStatusClass(status: string): string {
  if (status === 'success') return 'st-done'
  if (status === 'error') return 'st-failed'
  if (status === 'pending') return 'st-doing'
  return 'st-todo'
}

export function CnbBadge({ item }: { item?: CnbSummaryItem }) {
  if (!item) return <span className="muted">—</span>
  if (item.error) return <span className="error-text" title={item.error}>失败</span>
  if (!item.latest) return <span className="muted">无记录</span>
  const build = item.latest
  return (
    <a className={`task-status ${cnbStatusClass(build.status)}`} href={build.url} title={build.title} onClick={(e) => openBuild(e, build.url)}>
      {cnbStatusLabel(build.status)}
    </a>
  )
}

export function CnbCard({ projectId, branch }: { projectId: string; branch: string | null }) {
  const qc = useQueryClient()
  const [starting, setStarting] = useState(false)
  const builds = useQuery({
    queryKey: qk.cnbList(projectId),
    queryFn: () => unwrap(api.cnb.list(projectId)),
    retry: false
  })
  const notCnb = Boolean(builds.data && !builds.data.slug)

  const start = async () => {
    if (!branch) return
    const ok = window.confirm(
      `确认在 CNB 上构建？\n\n分支：${branch}\n使用 CNB 上该分支的最新提交。本地还没推送的提交不会参与这次构建。`
    )
    if (!ok) return
    setStarting(true)
    try {
      const result = await unwrap(api.cnb.start(projectId, branch))
      toast.success(result.sn ? `已触发构建 ${result.sn}` : '已触发构建', result.url)
      await qc.invalidateQueries({ queryKey: qk.cnbList(projectId) })
      await qc.invalidateQueries({ queryKey: qk.cnbSummary })
    } catch (error) {
      toast.error(error, '构建失败')
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="card">
      <div className="page-header">
        <h2>CNB 构建</h2>
        {!notCnb && (
          <button
            className="btn btn-small"
            disabled={!branch || starting}
            title={branch ? `构建 ${branch}` : '先切到一个分支'}
            onClick={() => void start()}
          >
            {starting ? '触发中…' : '构建'}
          </button>
        )}
        <button className="btn btn-small" disabled={builds.isFetching} onClick={() => qc.invalidateQueries({ queryKey: qk.cnbList(projectId) })}>
          {builds.isFetching ? '刷新中…' : '刷新'}
        </button>
      </div>
      {builds.isPending && <p className="hint">读取构建记录…</p>}
      {builds.isError && <p className="error-text">{builds.error.message}</p>}
      {builds.data && !builds.data.slug && <p className="hint">这个仓库的远程地址不是 CNB。</p>}
      {builds.data?.slug && builds.data.builds.length === 0 && <p className="hint">还没有构建记录。</p>}
      {builds.data && builds.data.builds.length > 0 && (
        <div>
          {builds.data.builds.map((build) => (
            <CnbRow key={build.sn || build.url} build={build} />
          ))}
        </div>
      )}
    </section>
  )
}

function CnbRow({ build }: { build: CnbBuild }) {
  return (
    <div className="cnb-row">
      <span className={`task-status ${cnbStatusClass(build.status)}`}>{cnbStatusLabel(build.status)}</span>
      <a className="cnb-title" href={build.url} title={build.title} onClick={(e) => openBuild(e, build.url)}>
        {build.title}
      </a>
      <span className="muted">{build.ref}</span>
      <span className="muted">{build.user}</span>
      <span className="muted mono">{build.createTime}</span>
      {build.durationMs !== null && <span className="muted">{formatDuration(build.durationMs)}</span>}
    </div>
  )
}

function openBuild(event: { preventDefault(): void; stopPropagation(): void }, url: string) {
  event.preventDefault()
  event.stopPropagation()
  void api.app.openExternal(url)
}
