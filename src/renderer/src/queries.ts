import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { StatusMap } from '../../shared/ipc'
import type { OpenerKind, PrefsPatch, Project } from '../../shared/types'
import { api, unwrap } from './api'
import { useRuns } from './stores/runs'
import { toast } from './stores/toast'
import { useUi } from './stores/ui'

export const qk = {
  registry: ['registry'] as const,
  status: ['status'] as const,
  prefs: ['prefs'] as const,
  branches: (id: string) => ['branches', id] as const,
  scripts: (id: string) => ['scripts', id] as const
}

export function useRegistry() {
  return useQuery({ queryKey: qk.registry, queryFn: () => unwrap(api.registry.list()) })
}

export function useStatusAll(enabled: boolean) {
  return useQuery({
    queryKey: qk.status,
    queryFn: () => unwrap(api.git.statusAll()),
    refetchInterval: 60_000,
    enabled
  })
}

export function usePrefs() {
  return useQuery({ queryKey: qk.prefs, queryFn: () => unwrap(api.settings.get()) })
}

export function useScripts(id: string) {
  return useQuery({ queryKey: qk.scripts(id), queryFn: () => unwrap(api.runner.scripts(id)) })
}

export function useBranches(id: string, enabled: boolean) {
  return useQuery({ queryKey: qk.branches(id), queryFn: () => unwrap(api.git.branches(id)), enabled })
}

/** 只刷新单个仓库的状态并合并进总览缓存，避免一次操作触发全量刷新 */
export async function refreshStatus(qc: QueryClient, id: string): Promise<void> {
  const result = await api.git.status(id)
  qc.setQueryData<StatusMap>(qk.status, (prev) => ({ ...prev, [id]: result }))
}

type GitAction =
  | { kind: 'pull' | 'fetch'; id: string }
  | { kind: 'checkout' | 'createBranch'; id: string; branch: string }

const ACTION_LABELS: Record<GitAction['kind'], string> = {
  pull: 'pull',
  fetch: 'fetch',
  checkout: '切换分支',
  createBranch: '新建分支'
}

export function useGitAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: GitAction) => {
      switch (a.kind) {
        case 'pull':
          return unwrap(api.git.pull(a.id))
        case 'fetch':
          return unwrap(api.git.fetch(a.id))
        case 'checkout':
          return unwrap(api.git.checkout(a.id, a.branch))
        case 'createBranch':
          return unwrap(api.git.createBranch(a.id, a.branch))
      }
    },
    onSuccess: (_data, a) => toast.success(`${ACTION_LABELS[a.kind]}完成`),
    onError: (e, a) => toast.error(e, `${ACTION_LABELS[a.kind]}失败`),
    onSettled: async (_data, _err, a) => {
      await refreshStatus(qc, a.id)
      await qc.invalidateQueries({ queryKey: qk.branches(a.id) })
    }
  })
}

export function useFetchAll(projects: Project[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.git.fetchAll()),
    onSuccess: (results) => {
      const entries = Object.entries(results)
      const failed = entries.filter(([, r]) => !r.ok)
      const name = (id: string) => projects.find((p) => p.id === id)?.name ?? id
      if (failed.length === 0) {
        toast.success(`全部 fetch 完成：${entries.length} 个仓库`)
      } else {
        toast.failure(
          `全部 fetch：成功 ${entries.length - failed.length}，失败 ${failed.length}`,
          failed.map(([id, r]) => `${name(id)}：${r.ok ? '' : r.error.message}`).join('\n')
        )
      }
    },
    onError: (e) => toast.error(e, '全部 fetch 失败'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.status })
  })
}

export function useSavePrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: PrefsPatch) => unwrap(api.settings.set(patch)),
    onSuccess: (prefs) => qc.setQueryData(qk.prefs, prefs),
    onError: (e) => toast.error(e, '保存设置失败')
  })
}

export async function openWith(id: string, opener: OpenerKind): Promise<void> {
  try {
    await unwrap(api.launcher.open(id, opener))
  } catch (e) {
    toast.error(e, '打开失败')
  }
}

export async function startScript(projectId: string, script: string): Promise<void> {
  const runs = useRuns.getState()
  try {
    const session = await unwrap(api.runner.start(projectId, script))
    runs.upsert(session)
    runs.setActive(session.runId)
  } catch (e) {
    const existing = Object.values(runs.sessions).find(
      (s) => s.status === 'running' && s.projectId === projectId && s.script === script
    )
    if (existing) runs.setActive(existing.runId)
    else toast.error(e, `启动 ${script} 失败`)
  }
  useUi.getState().setLogOpen(true)
}

export async function stopScript(runId: string): Promise<void> {
  useRuns.getState().markStopping(runId)
  try {
    await unwrap(api.runner.stop(runId))
  } catch (e) {
    toast.error(e, '停止失败')
  }
}
