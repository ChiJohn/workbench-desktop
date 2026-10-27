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
  const [picked, setPicked] = useState('')
  const builds = useQuery({
    queryKey: qk.cnbList(projectId),
    queryFn: () => unwrap(api.cnb.list(projectId)),
    retry: false
  })
  const notCnb = Boolean(builds.data && !builds.data.slug)
  const triggers = useQuery({
    queryKey: qk.cnbTriggers(projectId, branch ?? ''),
    queryFn: () => unwrap(api.cnb.triggers(projectId, branch as string)),
    enabled: Boolean(branch) && Boolean(builds.data?.slug),
    retry: false
  })
  const options = triggers.data?.options ?? []
  const matched = options.filter((item) => item.matched)
  const chosen = matched.find((item) => item.name === picked) ?? (matched.length === 1 ? matched[0] : undefined)

  const start = async () => {
    if (!branch || !chosen) return
    const env = Object.entries(chosen.env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    const ok = window.confirm(
      `确认在 CNB 上构建？\n\n分支：${branch}\n按钮：${chosen.name}\n事件：${chosen.event}${env ? `\n${env}` : ''}\n使用 origin 上这个分支的构建配置。`
    )
    if (!ok) return
    setStarting(true)
    try {
      const result = await unwrap(api.cnb.start(projectId, branch, chosen.name))
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
          <>
            <select
              value={chosen?.name ?? ''}
              disabled={!branch || triggers.isPending || options.length === 0}
              title="来自 .cnb/web_trigger.yml，只启用当前分支匹配的按钮"
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="">{branch ? '选择构建' : '先切到一个分支'}</option>
              {options.map((item) => (
                <option key={item.name} value={item.name} disabled={!item.matched}>
                  {item.matched ? item.name : `${item.name}（当前分支不可用）`}
                </option>
              ))}
            </select>
            <button className="btn btn-small" type="button" disabled={!chosen || starting} onClick={() => void start()}>
              {starting ? '触发中…' : '构建'}
            </button>
          </>
        )}
        <button className="btn btn-small" disabled={builds.isFetching} onClick={() => qc.invalidateQueries({ queryKey: qk.cnbList(projectId) })}>
          {builds.isFetching ? '刷新中…' : '刷新'}
        </button>
      </div>
      {branch && builds.data?.slug && triggers.data?.missing === 'rev' && (
        <p className="hint">本地还没有 origin/{branch}，先 fetch 再选择构建事件。</p>
      )}
      {branch && builds.data?.slug && triggers.data?.missing === 'file' && (
        <p className="hint">origin/{branch} 上没有 .cnb.yml。</p>
      )}
      {branch && builds.data?.slug && triggers.data && !triggers.data.missing && matched.length === 0 && options.length > 0 && (
        <p className="hint">
          当前分支没有可用的构建按钮。配置里有：{options.map((item) => item.name).join('、')}。换到 dev、test、uat 或 main 开头的分支后再选。
        </p>
      )}
      {branch && builds.data?.slug && triggers.data && !triggers.data.missing && options.length === 0 && (
        <p className="hint">origin/{branch} 的配置里没有构建按钮。</p>
      )}
      {triggers.isError && <p className="error-text">{triggers.error.message}</p>}
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
