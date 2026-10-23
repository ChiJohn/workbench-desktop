import { create } from 'zustand'
import type { ReleaseJob } from '../../../shared/types'

interface ReleasesState {
  /** 每个项目只保留最近一次流水线 */
  jobs: Record<string, ReleaseJob>
  upsert(job: ReleaseJob): ReleaseJob | undefined
}

export const useReleases = create<ReleasesState>((set, get) => ({
  jobs: {},
  upsert: (job) => {
    const prev = get().jobs[job.projectId]
    // 事件与 start 的返回值可能乱序到达，旧快照不能覆盖新快照
    if (prev && prev.jobId !== job.jobId && prev.startedAt > job.startedAt) return prev
    if (prev && prev.jobId === job.jobId && prev.status !== 'running' && job.status === 'running') return prev
    set({ jobs: { ...get().jobs, [job.projectId]: job } })
    return prev
  }
}))
