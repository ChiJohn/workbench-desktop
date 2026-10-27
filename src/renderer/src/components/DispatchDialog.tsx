import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { MulticaOverview, Prefs, TapdItem } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk, refreshMultica } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'

const DEFAULT_AGENT = '前端开发'

interface Props {
  item: TapdItem
  repoId: string | undefined
  overview: MulticaOverview
  prefs?: Prefs
  initialTitle?: string
  onClose(): void
}

export function DispatchDialog({ item, repoId, overview, prefs, initialTitle, onClose }: Props) {
  const qc = useQueryClient()
  const openIssue = useUi((s) => s.openIssue)
  const { agents, projects } = overview
  const lastAgent = prefs?.multica?.lastAgentId
  const [projectId, setProjectId] = useState(() => projects.find((p) => repoId && p.repoId === repoId)?.id ?? '')
  const [agentId, setAgentId] = useState(
    () => agents.find((a) => a.id === lastAgent)?.id ?? agents.find((a) => a.name === DEFAULT_AGENT)?.id ?? agents[0]?.id ?? ''
  )
  const [title, setTitle] = useState(initialTitle?.trim() || item.title)
  const [busy, setBusy] = useState(false)
  const [skipDesigns, setSkipDesigns] = useState<string[]>([])
  const [skipApis, setSkipApis] = useState<string[]>([])
  const align = useQuery({ queryKey: qk.align(item.key), queryFn: () => unwrap(api.align.list(item.key)) })
  const designs = align.data?.designs ?? []
  const apis = align.data?.apis ?? []
  const designCount = designs.filter((d) => !skipDesigns.includes(d.url)).length
  const apiCount = apis.filter((a) => !skipApis.includes(a.target)).length

  const toggle = (id: string, include: boolean, skipped: string[], setSkipped: (next: string[]) => void) => {
    setSkipped(include ? skipped.filter((x) => x !== id) : [...skipped, id])
  }

  const submit = async () => {
    setBusy(true)
    try {
      const r = await unwrap(
        api.multica.dispatch({
          tapdKey: item.key,
          title: title.trim(),
          projectId: projectId || null,
          agentId: agentId || null,
          align: { skipDesigns, skipApis }
        })
      )
      toast.success(`已派单 ${r.issue.identifier}`, r.issue.title)
      if (r.warning) toast.failure(r.warning)
      qc.setQueryData(qk.multicaByTapd(item.key), r.issue)
      await qc.invalidateQueries({ queryKey: qk.prefs })
      await refreshMultica(qc, false)
      onClose()
      openIssue(r.issue.id)
    } catch (e) {
      toast.error(e, '派单失败')
      setBusy(false)
    }
  }

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal form" onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
        <h2>派给智能体</h2>
        <label>
          <span>标题</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span>multica 项目（{overview.workspace.name}）</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">不归属项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {!projectId && <small className="warn-text">不归属项目时，智能体拿不到项目上下文（仓库目录等）</small>}
        </label>
        <label>
          <span>智能体</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">暂不指派（只建单）</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <p className={agentId ? 'warn-text' : 'hint'}>
          {agentId ? '指派后智能体会在本机开始修改仓库代码。' : '不指派不会触发运行，之后可以在 multica 里指派。'}
        </p>
        {align.isPending && <p className="hint">正在读取设计稿和接口…</p>}
        {align.isError && <p className="error-text">设计与接口没读到：{align.error.message}</p>}
        {(designs.length > 0 || apis.length > 0) && (
          <details className="align-dispatch">
            <summary>
              设计稿 {designCount} 个、接口 {apiCount} 个将随单发送
            </summary>
            {designs.map((d) => (
              <label key={d.url} className="checkbox">
                <input
                  type="checkbox"
                  checked={!skipDesigns.includes(d.url)}
                  onChange={(e) => toggle(d.url, e.target.checked, skipDesigns, setSkipDesigns)}
                />
                设计稿 · {d.name}
              </label>
            ))}
            {apis.map((a) => (
              <label key={a.target} className="checkbox">
                <input
                  type="checkbox"
                  checked={!skipApis.includes(a.target)}
                  onChange={(e) => toggle(a.target, e.target.checked, skipApis, setSkipApis)}
                />
                接口 · {a.title}
              </label>
            ))}
            <small className="hint">取消勾选只影响这次派单，不会从任务卡上删掉</small>
          </details>
        )}
        <div className="button-row">
          <button autoFocus className="btn btn-primary" disabled={busy || !title.trim() || align.isPending} onClick={submit}>
            {busy ? '派单中…' : '确认派单'}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
