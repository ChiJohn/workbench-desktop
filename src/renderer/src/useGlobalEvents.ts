import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api, unwrap } from './api'
import { qk } from './queries'
import { useRuns } from './stores/runs'
import { useUi } from './stores/ui'
import { writeTerminal } from './terminals'

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
      api.on.runnerExit((e) => runs().markExited(e.runId, e.exitCode))
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

    return () => offs.forEach((off) => off())
  }, [qc])
}
