import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { RegistryResult, ReleaseJob } from '../../shared/types'
import { api, unwrap } from './api'
import { formatBytes } from './format'
import { qk } from './queries'
import { useReleases } from './stores/releases'
import { useReport } from './stores/report'
import { useRuns } from './stores/runs'
import { toast } from './stores/toast'
import { useUi } from './stores/ui'
import { writeTerminal } from './terminals'

function onReleaseFinished(qc: QueryClient, job: ReleaseJob): void {
  const name =
    qc.getQueryData<RegistryResult>(qk.registry)?.projects.find((p) => p.id === job.projectId)?.name ?? job.projectId
  const size = job.packageSize !== undefined ? ` · 包大小 ${formatBytes(job.packageSize)}` : ''
  if (job.status === 'ok') {
    toast.success(job.action === 'preview' ? `${name}：预览二维码已生成${size}` : `${name}：已上传 ${job.upload?.version}${size}`)
  } else if (job.status === 'failed' && job.error) {
    toast.failure(`${name}：${job.error.message}`, job.error.detail)
  }
  qc.invalidateQueries({ queryKey: qk.releaseInfo(job.projectId) })
  if (job.action === 'upload' && job.status === 'ok') qc.invalidateQueries({ queryKey: qk.prefs })
}

export function useGlobalEvents(): void {
  const qc = useQueryClient()

  useEffect(() => {
    const runs = useRuns.getState
    const offs = [
      api.on.registryChanged(() => {
        qc.invalidateQueries({ queryKey: qk.registry })
        qc.invalidateQueries({ queryKey: qk.status })
      }),
      api.on.runnerStarted((session) => {
        runs().upsert(session)
        runs().setActive(session.runId)
        useUi.getState().setLogOpen(true)
      }),
      api.on.runnerOutput((e) => writeTerminal(e.runId, e.chunk)),
      api.on.runnerExit((e) => runs().markExited(e.runId, e.exitCode)),
      api.on.tapdUpdated((board) => qc.setQueryData(qk.tapdBoard, board)),
      api.on.tapdFocus((key) => {
        useUi.getState().setView({ kind: 'tasks' })
        useUi.getState().setTaskKey(key)
      }),
      api.on.reportProgress((text) => useReport.getState().setProgress(text)),
      api.on.reportOpen((kind) => {
        useReport.getState().open(kind)
        useUi.getState().setView({ kind: 'reports' })
      }),
      api.on.releaseChanged((job) => {
        const prev = useReleases.getState().upsert(job)
        const wasRunning = !prev || prev.jobId !== job.jobId || prev.status === 'running'
        if (wasRunning && job.status !== 'running') onReleaseFinished(qc, job)
      })
    ]

    // 界面重新加载后恢复主进程中仍存在的运行实例
    unwrap(api.runner.list())
      .then(async (sessions) => {
        for (const s of sessions) {
          if (runs().sessions[s.runId]) continue
          runs().upsert(s)
          writeTerminal(s.runId, await unwrap(api.runner.buffer(s.runId)))
        }
        if (!runs().active && sessions.length) runs().setActive(sessions[sessions.length - 1].runId)
      })
      .catch(() => undefined)
    unwrap(api.release.list())
      .then((jobs) => jobs.forEach((j) => useReleases.getState().upsert(j)))
      .catch(() => undefined)

    return () => offs.forEach((off) => off())
  }, [qc])
}
