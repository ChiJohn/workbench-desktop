import { create } from 'zustand'
import type { RunSession } from '../../../shared/types'

interface RunsState {
  sessions: Record<string, RunSession>
  order: string[]
  active: string | null
  /** 用户主动停止的实例；它们的非零退出码不算失败 */
  stoppedByUser: Record<string, true>
  upsert(session: RunSession): void
  markExited(runId: string, exitCode: number | null): void
  markStopping(runId: string): void
  remove(runId: string): void
  setActive(runId: string | null): void
}

export const useRuns = create<RunsState>((set, get) => ({
  sessions: {},
  order: [],
  active: null,
  stoppedByUser: {},
  upsert: (session) => {
    const { sessions, order } = get()
    const prev = sessions[session.runId]
    set({
      // 退出事件可能先于 start 的返回值到达，不能把 exited 覆盖回 running
      sessions: { ...sessions, [session.runId]: prev?.status === 'exited' ? prev : session },
      order: order.includes(session.runId) ? order : [...order, session.runId]
    })
  },
  markExited: (runId, exitCode) => {
    const { sessions } = get()
    const s = sessions[runId]
    if (!s) return
    set({ sessions: { ...sessions, [runId]: { ...s, status: 'exited', exitCode } } })
  },
  markStopping: (runId) => set({ stoppedByUser: { ...get().stoppedByUser, [runId]: true } }),
  remove: (runId) => {
    const { sessions, order, active } = get()
    const rest = { ...sessions }
    delete rest[runId]
    const nextOrder = order.filter((id) => id !== runId)
    set({
      sessions: rest,
      order: nextOrder,
      active: active === runId ? (nextOrder[nextOrder.length - 1] ?? null) : active
    })
  },
  setActive: (active) => set({ active })
}))

export function findRunning(
  sessions: Record<string, RunSession>,
  projectId: string,
  script?: string
): RunSession | undefined {
  return Object.values(sessions).find(
    (s) => s.status === 'running' && s.projectId === projectId && (script === undefined || s.script === script)
  )
}
