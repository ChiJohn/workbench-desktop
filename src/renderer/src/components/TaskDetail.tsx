import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Prefs, Project, TapdBoard, TapdItem, TapdTransition } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk, refreshTapdBoard, useSavePrefs, useTapdDetail } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { KIND_LABELS, RepoSelect } from './TasksPage'

interface Props {
  itemKey: string
  projects: Project[]
  prefs?: Prefs
  onClose(): void
}

function linkedRepo(item: TapdItem, prefs?: Prefs): string | undefined {
  return item.iterationId ? prefs?.tapd?.iterationRepos?.[item.iterationId] : prefs?.tapd?.itemRepos?.[item.key]
}

export function TaskDetail({ itemKey, projects, prefs, onClose }: Props) {
  const qc = useQueryClient()
  const detail = useTapdDetail(itemKey)
  const savePrefs = useSavePrefs()
  const setView = useUi((s) => s.setView)
  const setTaskKey = useUi((s) => s.setTaskKey)
  const [confirming, setConfirming] = useState<TapdTransition | null>(null)
  const [busy, setBusy] = useState(false)

  const head = (
    <div className="task-detail-head">
      <span className="muted mono">{itemKey}</span>
      <span className="spacer" />
      <button className="icon-btn" title="关闭" onClick={onClose}>
        ×
      </button>
    </div>
  )
  if (detail.isPending) return <aside className="task-detail">{head}<p className="hint">读取详情…</p></aside>
  if (detail.isError) {
    return (
      <aside className="task-detail">
        {head}
        <p className="error-text">{detail.error.message}</p>
      </aside>
    )
  }

  const { item, description, transitions, card } = detail.data
  const repoId = linkedRepo(item, prefs)
  const repo = projects.find((p) => p.id === repoId)

  const createCard = async () => {
    if (!repo) return
    setBusy(true)
    try {
      const rel = await unwrap(api.tapd.createCard(item.key, repo.id))
      toast.success('任务卡已就绪', rel)
      await qc.invalidateQueries({ queryKey: qk.tapdDetail(item.key) })
    } catch (e) {
      toast.error(e, '生成任务卡失败')
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

  const transition = async (t: TapdTransition) => {
    setBusy(true)
    try {
      await unwrap(api.tapd.transition(item.key, t.to))
      toast.success(`已流转为「${t.label}」`, item.title)
      setConfirming(null)
      await refreshTapdBoard(qc, false)
      const board = qc.getQueryData<TapdBoard>(qk.tapdBoard)
      if (board?.items.some((i) => i.key === item.key)) {
        await qc.invalidateQueries({ queryKey: qk.tapdDetail(item.key) })
      } else {
        setTaskKey(null)
      }
    } catch (e) {
      toast.error(e, '流转失败')
    }
    setBusy(false)
  }

  return (
    <aside className="task-detail">
      {head}
      <h2 className="task-detail-title">
        <span className={`kind-badge ${item.kind}`}>{KIND_LABELS[item.kind]}</span> {item.title}
      </h2>
      <dl className="confirm-list">
        <dt>项目</dt>
        <dd>{item.workspaceName}</dd>
        <dt>状态</dt>
        <dd>{item.statusLabel}</dd>
        <dt>迭代</dt>
        <dd>{item.iterationId ? (item.iterationName ?? item.iterationId) : '未规划迭代'}</dd>
        <dt>处理人</dt>
        <dd>{item.owners.join('、') || '—'}</dd>
        {item.priority && (
          <>
            <dt>优先级</dt>
            <dd>{item.priority}</dd>
          </>
        )}
        <dt>更新</dt>
        <dd className="mono">{item.modified}</dd>
        <dt>仓库</dt>
        <dd>
          {item.iterationId ? (
            <span>{repo ? repo.name : '未关联'}<span className="muted">（按迭代关联，在分组标题处修改）</span></span>
          ) : (
            <RepoSelect
              value={repoId}
              projects={projects}
              onChange={(id) => savePrefs.mutate({ tapd: { itemRepos: { [item.key]: id } } })}
            />
          )}
        </dd>
      </dl>

      <div className="button-row wrap">
        <button className="btn" onClick={() => api.app.openExternal(item.url)}>
          在 TAPD 打开
        </button>
        <button className="btn" disabled={!repo} title={repo ? undefined : '先关联仓库'} onClick={() => repo && setView({ kind: 'project', id: repo.id })}>
          去仓库
        </button>
        {card ? (
          <button className="btn" onClick={openCard} title={card}>
            在 Obsidian 打开
          </button>
        ) : (
          <button className="btn" disabled={!repo || busy} title={repo ? undefined : '先关联仓库，任务卡写到对应项目目录'} onClick={createCard}>
            生成任务卡
          </button>
        )}
      </div>

      {transitions.length > 0 && (
        <div className="task-transitions">
          <span className="muted">流转到</span>
          {transitions.map((t) => (
            <button
              key={t.to}
              className="btn btn-small"
              disabled={busy || t.blockedBy.length > 0}
              title={t.blockedBy.length ? `需要填写：${t.blockedBy.join('、')}，请在 TAPD 中操作` : undefined}
              onClick={() => setConfirming(t)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <h3>描述</h3>
      <div className="task-desc">{description || <span className="muted">（无描述）</span>}</div>

      {confirming && (
        <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && !busy && setConfirming(null)}>
          <div className="modal form" onKeyDown={(e) => e.key === 'Escape' && !busy && setConfirming(null)}>
            <h2>确认流转</h2>
            <dl className="confirm-list">
              <dt>单号</dt>
              <dd className="mono">{item.id}</dd>
              <dt>标题</dt>
              <dd>{item.title}</dd>
              <dt>状态</dt>
              <dd>
                {item.statusLabel} → <strong>{confirming.label}</strong>
              </dd>
            </dl>
            <p className="hint">会直接修改 TAPD 上的单子状态。</p>
            <div className="button-row">
              <button autoFocus className="btn btn-primary" disabled={busy} onClick={() => transition(confirming)}>
                {busy ? '提交中…' : '确认流转'}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
