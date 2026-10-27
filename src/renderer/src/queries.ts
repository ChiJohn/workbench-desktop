import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { StatusMap } from '../../shared/ipc'
import type { OpenerKind, PrefsPatch, Project, ReleaseRequest, ReportKind, ReportRange } from '../../shared/types'
import { api, unwrap } from './api'
import { useReleases } from './stores/releases'
import { useRuns } from './stores/runs'
import { toast } from './stores/toast'
import { useUi } from './stores/ui'

export const qk = {
  registry: ['registry'] as const,
  status: ['status'] as const,
  prefs: ['prefs'] as const,
  branches: (id: string) => ['branches', id] as const,
  scripts: (id: string) => ['scripts', id] as const,
  releaseInfo: (id: string) => ['releaseInfo', id] as const,
  tapdStatus: ['tapdStatus'] as const,
  apifoxStatus: ['apifoxStatus'] as const,
  cnbStatus: ['cnbStatus'] as const,
  cnbSummary: ['cnbSummary'] as const,
  cnbList: (id: string) => ['cnbList', id] as const,
  align: (key: string) => ['align', key] as const,
  tapdBoard: ['tapdBoard'] as const,
  tapdDetail: (key: string) => ['tapdDetail', key] as const,
  multica: ['multica'] as const,
  multicaIssue: (id: string) => ['multicaIssue', id] as const,
  multicaByTapd: (key: string) => ['multicaByTapd', key] as const,
  gitChanges: (id: string) => ['gitChanges', id] as const,
  gitDiff: (id: string, path: string) => ['gitDiff', id, path] as const,
  report: (kind: ReportKind, range: ReportRange) => ['report', kind, range.start, range.end] as const
}

export function useMulticaOverview() {
  return useQuery({
    queryKey: qk.multica,
    queryFn: () => unwrap(api.multica.overview(false)),
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false
  })
}

export async function refreshMultica(qc: QueryClient, force: boolean): Promise<void> {
  try {
    qc.setQueryData(qk.multica, await unwrap(api.multica.overview(force)))
  } catch (e) {
    toast.error(e, '刷新 multica 失败')
  }
}

export function useMulticaIssue(id: string | null) {
  return useQuery({
    queryKey: qk.multicaIssue(id ?? ''),
    queryFn: () => unwrap(api.multica.issue(id as string)),
    enabled: Boolean(id),
    retry: false
  })
}

export function useMulticaByTapd(key: string) {
  return useQuery({ queryKey: qk.multicaByTapd(key), queryFn: () => unwrap(api.multica.findByTapd(key)), retry: false })
}

export function useGitChanges(id: string | null) {
  return useQuery({
    queryKey: qk.gitChanges(id ?? ''),
    queryFn: () => unwrap(api.git.changes(id as string)),
    enabled: Boolean(id),
    retry: false
  })
}

export function useGitDiff(id: string, path: string | null) {
  return useQuery({
    queryKey: qk.gitDiff(id, path ?? ''),
    queryFn: () => unwrap(api.git.diff(id, path as string)),
    enabled: Boolean(path),
    retry: false
  })
}

/** 收集较慢且读取多个外部系统，只在切换时间段或手动「重新收集」时拉取 */
export function useReportMaterial(kind: ReportKind, range: ReportRange) {
  return useQuery({
    queryKey: qk.report(kind, range),
    queryFn: () => unwrap(api.report.collect(kind, range)),
    staleTime: Infinity,
    retry: false
  })
}

export function useTapdStatus() {
  return useQuery({ queryKey: qk.tapdStatus, queryFn: () => unwrap(api.tapd.status()) })
}

export function useApifoxStatus() {
  return useQuery({ queryKey: qk.apifoxStatus, queryFn: () => unwrap(api.apifox.status()) })
}

export function useCnbStatus() {
  return useQuery({ queryKey: qk.cnbStatus, queryFn: () => unwrap(api.cnb.status()) })
}

export function useCnbSummary(enabled: boolean) {
  return useQuery({
    queryKey: qk.cnbSummary,
    queryFn: () => unwrap(api.cnb.summary()),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false
  })
}

export function useTapdBoard(enabled: boolean) {
  return useQuery({
    queryKey: qk.tapdBoard,
    queryFn: () => unwrap(api.tapd.board(false)),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false
  })
}

export async function refreshTapdBoard(qc: QueryClient, force: boolean): Promise<void> {
  try {
    qc.setQueryData(qk.tapdBoard, await unwrap(api.tapd.board(force)))
  } catch (e) {
    toast.error(e, '刷新 TAPD 失败')
  }
}

export function useTapdDetail(key: string | null) {
  return useQuery({
    queryKey: qk.tapdDetail(key ?? ''),
    queryFn: () => unwrap(api.tapd.detail(key as string)),
    enabled: Boolean(key),
    retry: false
  })
}

export function useReleaseInfo(id: string) {
  return useQuery({ queryKey: qk.releaseInfo(id), queryFn: () => unwrap(api.release.info(id)) })
}

export async function startRelease(req: ReleaseRequest): Promise<boolean> {
  try {
    useReleases.getState().upsert(await unwrap(api.release.start(req)))
    return true
  } catch (e) {
    toast.error(e, req.action === 'preview' ? '预览失败' : '上传失败')
    return false
  }
}

export async function cancelRelease(jobId: string): Promise<void> {
  try {
    await unwrap(api.release.cancel(jobId))
  } catch (e) {
    toast.error(e, '取消失败')
  }
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
  | { kind: 'pull' | 'fetch' | 'push'; id: string }
  | { kind: 'checkout' | 'createBranch'; id: string; branch: string }

const ACTION_LABELS: Record<GitAction['kind'], string> = {
  pull: 'pull',
  push: 'push',
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
        case 'push':
          return unwrap(api.git.push(a.id))
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
