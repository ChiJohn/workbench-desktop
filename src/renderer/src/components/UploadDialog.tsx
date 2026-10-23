import { useState, type FormEvent } from 'react'
import type { BuildChoice, Project, ReleaseInfo } from '../../../shared/types'
import { startRelease } from '../queries'

const VERSION_RE = /^\d+\.\d+\.\d+$/

interface Props {
  project: Project
  info: ReleaseInfo
  build: BuildChoice
  buildLabel: string
  onClose(): void
}

export function UploadDialog({ project, info, build, buildLabel, onClose }: Props) {
  const [version, setVersion] = useState(info.defaultVersion)
  const [desc, setDesc] = useState(info.defaultDesc)
  const [submitting, setSubmitting] = useState(false)
  const versionOk = VERSION_RE.test(version.trim())
  const descOk = desc.trim().length > 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!versionOk || !descOk) return
    setSubmitting(true)
    const ok = await startRelease({
      projectId: project.id,
      action: 'upload',
      build,
      version: version.trim(),
      desc: desc.trim(),
      expectedAppid: info.appid
    })
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal form" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>上传体验版</h2>
        <label>
          <span>版本号</span>
          <input autoFocus className="mono" value={version} onChange={(e) => setVersion(e.target.value)} />
          {!versionOk && <small className="error-text">版本号需要是 x.y.z 格式</small>}
        </label>
        <label>
          <span>描述</span>
          <textarea rows={3} value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} />
          <small>双引号会替换为单引号，% 替换为全角 ％</small>
        </label>

        <dl className="confirm-list">
          <dt>项目</dt>
          <dd>{project.name}</dd>
          <dt>构建</dt>
          <dd>{buildLabel}</dd>
          <dt>appid</dt>
          <dd className="mono">
            {info.appid ?? '未读取到'}
            {build.kind !== 'skip' && <span className="muted">（构建后复核，不一致会停止上传）</span>}
          </dd>
          <dt>分支</dt>
          <dd className="mono">{info.branch ?? '(detached)'}</dd>
          <dt>提交</dt>
          <dd>
            {info.commit ? (
              <>
                <span className="mono muted">{info.commit.hash}</span> {info.commit.subject}
              </>
            ) : (
              '暂无提交'
            )}
          </dd>
        </dl>
        {info.changes > 0 && (
          <p className="error-text">工作区有 {info.changes} 个未提交改动，会一并打进包里。</p>
        )}

        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={!versionOk || !descOk || submitting}>
            {submitting ? '启动中…' : '确认上传'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </div>
  )
}
