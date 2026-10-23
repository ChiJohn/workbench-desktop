import { useState } from 'react'
import type { BuildChoice, Prefs, Project, ReleaseInfo, ReleaseJob, ReleaseStep } from '../../../shared/types'
import { api } from '../api'
import { clockTime, formatBytes, formatDuration } from '../format'
import { cancelRelease, startRelease, useReleaseInfo } from '../queries'
import { useReleases } from '../stores/releases'
import { useRuns } from '../stores/runs'
import { useUi } from '../stores/ui'
import { ReleaseEnvSettings } from './ReleaseEnvSettings'
import { UploadDialog } from './UploadDialog'

const MP_URL = 'https://mp.weixin.qq.com/'

const STEP_ICONS: Record<ReleaseStep['status'], string> = {
  pending: '○',
  running: '◌',
  ok: '✓',
  failed: '✕',
  skipped: '–',
  cancelled: '⊘'
}

function choiceKey(c: BuildChoice): string {
  return c.kind === 'script' ? `script:${c.script}` : c.kind
}

function parseChoice(key: string): BuildChoice {
  return key.startsWith('script:') ? { kind: 'script', script: key.slice(7) } : { kind: key as 'npm' | 'skip' }
}

export function choiceLabel(info: ReleaseInfo, c: BuildChoice): string {
  if (c.kind === 'skip') return '跳过构建，使用现有产物'
  if (c.kind === 'npm') return '构建 npm'
  const env = info.envs.find((e) => e.script === c.script)
  return env && env.label !== env.script ? `${env.label}（${env.script}）` : c.script
}

function defaultChoice(info: ReleaseInfo): BuildChoice {
  if (info.native) return { kind: 'npm' }
  const env = info.envs.find((e) => !e.hidden)
  return env ? { kind: 'script', script: env.script } : { kind: 'skip' }
}

function StepBar({ job }: { job: ReleaseJob }) {
  const showLog = (runId?: string) => {
    if (!runId) return
    useRuns.getState().setActive(runId)
    useUi.getState().setLogOpen(true)
  }
  return (
    <div className="release-steps">
      {job.steps.map((s, i) => (
        <span key={s.kind + i} className="release-step-wrap">
          {i > 0 && <span className="muted">→</span>}
          <button
            className={`release-step ${s.status}`}
            disabled={!s.runId}
            title={s.runId ? '查看日志' : undefined}
            onClick={() => showLog(s.runId)}
          >
            <span className="step-icon">{STEP_ICONS[s.status]}</span>
            {s.label}
            {s.startedAt && s.finishedAt && <span className="muted">{formatDuration(s.finishedAt - s.startedAt)}</span>}
          </button>
        </span>
      ))}
    </div>
  )
}

export function ReleaseCard({ project, prefs }: { project: Project; prefs?: Prefs }) {
  const info = useReleaseInfo(project.id)
  const job = useReleases((s) => s.jobs[project.id])
  const [choice, setChoice] = useState<BuildChoice | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editingEnvs, setEditingEnvs] = useState(false)

  if (info.isPending) return <p className="hint">读取小程序配置…</p>
  if (info.isError) return <p className="error-text">{info.error.message}</p>

  const data = info.data
  const current = choice ?? defaultChoice(data)
  const running = job?.status === 'running'
  const options: BuildChoice[] = [
    ...(data.native
      ? [{ kind: 'npm' } as const]
      : data.envs
          .filter((e) => !e.hidden || (current.kind === 'script' && current.script === e.script))
          .map((e) => ({ kind: 'script', script: e.script }) as const)),
    { kind: 'skip' }
  ]

  return (
    <>
      {!prefs?.wechatDevtoolsCli && (
        <p className="warn-text">未找到微信开发者工具 cli.bat，请在「设置」中配置路径。</p>
      )}
      <div className="button-row release-controls">
        <label className="inline-field left">
          构建
          <select
            value={choiceKey(current)}
            disabled={running}
            onChange={(e) => setChoice(parseChoice(e.target.value))}
          >
            {options.map((c) => (
              <option key={choiceKey(c)} value={choiceKey(c)}>
                {choiceLabel(data, c)}
              </option>
            ))}
          </select>
        </label>
        {!data.native && (
          <button className="btn btn-ghost btn-small" onClick={() => setEditingEnvs(!editingEnvs)}>
            环境设置
          </button>
        )}
        <button
          className="btn"
          disabled={running}
          onClick={() => startRelease({ projectId: project.id, action: 'preview', build: current })}
        >
          预览
        </button>
        <button
          className="btn btn-primary"
          disabled={running}
          onClick={() => info.refetch().then(() => setUploading(true))}
        >
          上传体验版
        </button>
        {running && (
          <button className="btn btn-danger" onClick={() => cancelRelease(job.jobId)}>
            取消
          </button>
        )}
      </div>

      {editingEnvs && (
        <ReleaseEnvSettings projectId={project.id} envs={data.envs} onClose={() => setEditingEnvs(false)} />
      )}

      {job && (
        <div className="release-job">
          <StepBar job={job} />
          {job.status === 'failed' && job.error && (
            <div className="error-text" title={job.error.detail}>
              {job.error.message}
            </div>
          )}
          {job.status === 'ok' && job.action === 'upload' && job.upload && (
            <div>
              已上传 <span className="mono">{job.upload.version}</span>
              {job.appid && <span className="muted mono"> · {job.appid}</span>}
              {job.packageSize !== undefined && <span className="muted"> · 包大小 {formatBytes(job.packageSize)}</span>}
              <button className="btn btn-ghost btn-small" onClick={() => api.app.openExternal(MP_URL)}>
                打开公众平台设置体验版
              </button>
            </div>
          )}
          {job.qrDataUrl && (
            <div className="release-qr">
              <img src={job.qrDataUrl} alt="预览二维码" />
              <div>
                <div>预览二维码</div>
                <div className="muted">{job.qrAt && `${clockTime(job.qrAt)} 生成`}</div>
                {job.appid && <div className="muted mono">{job.appid}</div>}
                {job.packageSize !== undefined && <div className="muted">包大小 {formatBytes(job.packageSize)}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {uploading && (
        <UploadDialog
          project={project}
          info={data}
          build={current}
          buildLabel={choiceLabel(data, current)}
          onClose={() => setUploading(false)}
        />
      )}
    </>
  )
}
