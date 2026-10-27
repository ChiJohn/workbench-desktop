import { useEffect, useState } from 'react'
import type { Project } from '../../../shared/types'
import { api, unwrap } from '../api'
import { useUi } from '../stores/ui'
import { toast } from '../stores/toast'

export function DepositDialog({ projects }: { projects: Project[] }) {
  const offer = useUi((s) => s.deposit)
  const clear = useUi((s) => s.clearDeposit)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [project, setProject] = useState('')
  const [task, setTask] = useState<string | undefined>()
  const [existing, setExisting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!offer) return
    let gone = false
    setTitle(offer.title)
    setProject(offer.project)
    setBody('')
    setExisting(null)
    setTask(offer.task)
    setBusy(true)
    unwrap(api.knowledge.draft({ task: offer.task, title: offer.title, project: offer.project }))
      .then((draft) => {
        if (gone) return
        if (draft.existing) {
          setExisting(draft.existing)
          return
        }
        setTitle(draft.title)
        setBody(draft.body)
        setProject(draft.project || offer.project)
        setTask(draft.task)
      })
      .catch((e) => {
        if (!gone) toast.error(e, '整理失败')
      })
      .finally(() => {
        if (!gone) setBusy(false)
      })
    return () => {
      gone = true
    }
  }, [offer])

  const close = () => {
    if (busy) void unwrap(api.knowledge.cancel()).catch(() => undefined)
    clear()
  }

  if (!offer) return null

  const save = async () => {
    setBusy(true)
    try {
      const rel = await unwrap(api.knowledge.save({ kind: 'knowledge', title, body, project: project || undefined, task }))
      toast.success('已写入知识库', rel)
      clear()
    } catch (e) {
      toast.error(e, '保存失败')
    }
    setBusy(false)
  }

  return (
    <div className="modal-mask" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>沉淀到知识库</h2>
        {existing ? (
          <p className="hint">
            这条任务已经沉淀过：
            <button
              className="btn btn-ghost"
              onClick={() => void unwrap(api.tapd.openCard(existing)).catch((e) => toast.error(e, '打开失败'))}
            >
              {existing}
            </button>
          </p>
        ) : (
          <>
            <div className="knowledge-row">
              <select value={project} disabled={busy} onChange={(e) => setProject(e.target.value)}>
                <option value="">不归属项目</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <textarea className="knowledge-note" value={body} disabled={busy} placeholder={busy ? '正在整理…' : ''} onChange={(e) => setBody(e.target.value)} />
          </>
        )}
        <div className="button-row">
          {!existing && (
            <button className="btn btn-primary" disabled={busy || !title.trim() || !body.trim()} onClick={() => void save()}>
              {busy ? '整理中…' : '保存'}
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={close}
          >
            {existing ? '关闭' : '跳过'}
          </button>
        </div>
      </div>
    </div>
  )
}
