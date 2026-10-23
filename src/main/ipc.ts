import { ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'
import { backfillCard, createCard, findCard, findCardBy } from '../core/tasks/taskCard'
import { mapLimit } from '../core/concurrency'
import { desktopExe } from '../core/multica/multicaCli'
import { dispatchDescription } from '../core/multica/multicaService'
import { AppError, wrap } from '../core/result'
import { findMiniprogramRoot } from '../core/launcher/launcherService'
import { buildReleaseInfo } from '../core/release/releaseInfo'
import { readScripts } from '../core/runner/packageScripts'
import { Channels, Events, type FetchAllMap, type StatusMap } from '../shared/ipc'
import type {
  MulticaCommitRequest,
  MulticaCompleteResult,
  MulticaDispatchRequest,
  MulticaIssueDetail,
  OpenerKind,
  Prefs,
  PrefsPatch,
  Project,
  ReleaseJob,
  ReleaseRequest,
  TapdDetail,
  TapdKind
} from '../shared/types'
import type { HotkeyManager } from './hotkey'
import type { Services } from './services'
import type { TapdPoller } from './tapdPoller'

const STATUS_CONCURRENCY = 6
const FETCH_CONCURRENCY = 4

export interface IpcDeps {
  services: Services
  hotkey: HotkeyManager
  poller: TapdPoller
  send(channel: string, payload?: unknown): void
}

function publicPrefs(p: Prefs): Prefs {
  const { tapdTokenEnc: _secret, ...rest } = p
  return rest
}

function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args) => wrap(() => fn(...args)))
}

async function availableProjects({ registry }: Services): Promise<Project[]> {
  const { projects } = await registry.current()
  return projects.filter((p) => p.available)
}

export function registerIpc({ services, hotkey, poller, send }: IpcDeps): void {
  const { registry, git, runner, launcher, prefs, release, tapd, tapdToken, multica } = services
  const repoPath = async (id: string) => (await registry.require(id)).repoPath

  handle(Channels.registryList, () => registry.load())

  handle(Channels.gitStatusAll, async (): Promise<StatusMap> => {
    const projects = await availableProjects(services)
    const results = await mapLimit(projects, STATUS_CONCURRENCY, (p) => wrap(() => git.status(p.repoPath)))
    return Object.fromEntries(projects.map((p, i) => [p.id, results[i]]))
  })
  handle(Channels.gitStatus, async (id: string) => git.status(await repoPath(id)))
  handle(Channels.gitFetchAll, async (): Promise<FetchAllMap> => {
    const projects = await availableProjects(services)
    const results = await mapLimit(projects, FETCH_CONCURRENCY, (p) =>
      wrap(async () => {
        await git.fetch(p.repoPath)
        return null
      })
    )
    return Object.fromEntries(projects.map((p, i) => [p.id, results[i]]))
  })
  handle(Channels.gitFetch, async (id: string) => {
    await git.fetch(await repoPath(id))
    return null
  })
  handle(Channels.gitPull, async (id: string) => {
    await git.pull(await repoPath(id))
    return null
  })
  handle(Channels.gitBranches, async (id: string) => git.branches(await repoPath(id)))
  handle(Channels.gitCheckout, async (id: string, branch: string) => {
    await git.checkout(await repoPath(id), branch)
    return null
  })
  handle(Channels.gitCreateBranch, async (id: string, branch: string) => {
    await git.createBranch(await repoPath(id), branch)
    return null
  })

  handle(Channels.runnerScripts, async (id: string) => readScripts(await repoPath(id)))
  handle(Channels.runnerStart, async (id: string, script: string) =>
    runner.start({ projectId: id, repoPath: await repoPath(id), script })
  )
  handle(Channels.runnerStop, async (runId: string) => {
    await runner.stop(runId)
    return null
  })
  handle(Channels.runnerList, () => runner.list())
  handle(Channels.runnerBuffer, (runId: string) => runner.buffer(runId))
  handle(Channels.runnerDispose, (runId: string) => {
    runner.dispose(runId)
    return null
  })

  handle(Channels.launcherOpen, async (id: string, opener: OpenerKind) => {
    const project = await registry.require(id)
    if (opener === 'wechat' && project.type !== 'miniapp') {
      throw new AppError('NOT_MINIAPP', '只有小程序项目可以用微信开发者工具打开')
    }
    const { terminal, wechatDevtoolsCli, repos } = prefs.get()
    await launcher.open(opener, {
      repoPath: project.repoPath,
      terminal,
      wechatDevtoolsCli,
      miniprogramRoot: repos[id]?.miniprogramRoot
    })
    return null
  })

  const requireMiniapp = async (id: string) => {
    const project = await registry.require(id)
    if (project.type !== 'miniapp') throw new AppError('NOT_MINIAPP', '只有小程序项目可以发版')
    const override = prefs.get().repos[id]?.miniprogramRoot
    return { project, root: override ?? (await findMiniprogramRoot(project.repoPath)) }
  }

  handle(Channels.releaseInfo, async (id: string) => {
    const { project, root } = await requireMiniapp(id)
    const status = await git.status(project.repoPath).catch(() => null)
    return buildReleaseInfo({ repoPath: project.repoPath, root, repoPrefs: prefs.get().repos[id] ?? {}, status })
  })
  handle(Channels.releaseStart, async (req: ReleaseRequest) => {
    const { project, root } = await requireMiniapp(req.projectId)
    const { wechatDevtoolsCli, wechatDevtoolsToken } = prefs.get()
    return release.start(req, { repoPath: project.repoPath, root, cli: wechatDevtoolsCli, token: wechatDevtoolsToken })
  })
  handle(Channels.releaseCancel, async (jobId: string) => {
    await release.cancel(jobId)
    return null
  })
  handle(Channels.releaseList, () => release.list())

  handle(Channels.tapdStatus, () => tapdToken.status())
  handle(Channels.tapdSetToken, (token: string | null) => {
    tapdToken.set(token)
    tapd.reset()
    return tapdToken.status()
  })
  handle(Channels.tapdBoard, (force?: boolean) => poller.refresh({ force: Boolean(force) }))
  handle(Channels.tapdDetail, async (key: string): Promise<TapdDetail> => {
    const detail = await tapd.detail(key)
    const card = await findCard(prefs.get().vaultPath, detail.item.id)
    return { ...detail, card }
  })
  handle(Channels.tapdTransition, async (key: string, to: string) => {
    await tapd.transition(key, to)
    return null
  })
  handle(Channels.tapdCreateCard, async (key: string, projectId: string) => {
    const project = await registry.require(projectId)
    const { item, description } = await tapd.detail(key)
    return createCard({ vaultPath: prefs.get().vaultPath, project, item, description })
  })
  handle(Channels.tapdOpenCard, async (relPath: string) => {
    const vaultPath = prefs.get().vaultPath
    const full = resolve(vaultPath, relPath)
    if (!full.startsWith(resolve(vaultPath) + sep) || !existsSync(full)) {
      throw new AppError('CARD_NOT_FOUND', `任务卡不存在：${relPath}`)
    }
    await shell.openExternal(
      `obsidian://open?vault=${encodeURIComponent(basename(vaultPath))}&file=${encodeURIComponent(relPath)}`
    )
    return null
  })

  handle(Channels.gitChanges, async (id: string) => git.changes(await repoPath(id)))
  handle(Channels.gitDiff, async (id: string, path: string) => git.diff(await repoPath(id), path))

  const parseTapdKey = (key: string | null): { id: string; kind: TapdKind } | null => {
    const m = key ? /^(story|bug|task):(\d+)$/.exec(key) : null
    return m ? { kind: m[1] as TapdKind, id: m[2] } : null
  }
  const issueRepo = async (repoId: string | null) => (repoId ? registry.require(repoId) : null)
  const backfill = async (detail: Omit<MulticaIssueDetail, 'card'>, project: Project) =>
    backfillCard({
      vaultPath: prefs.get().vaultPath,
      project,
      issue: detail.issue,
      description: detail.description,
      conclusion: detail.conclusion,
      tapd: parseTapdKey(detail.issue.tapdKey)
    })

  handle(Channels.multicaOverview, async (force?: boolean) => {
    await registry.current().catch(() => null)
    return multica.overview(Boolean(force))
  })
  handle(Channels.multicaIssue, async (id: string): Promise<MulticaIssueDetail> => {
    await registry.current().catch(() => null)
    const detail = await multica.issue(id)
    const vaultPath = prefs.get().vaultPath
    const tapdRef = parseTapdKey(detail.issue.tapdKey)
    const card = (await findCardBy(vaultPath, 'multica_id', detail.issue.identifier)) ?? (tapdRef ? await findCard(vaultPath, tapdRef.id) : null)
    return { ...detail, card }
  })
  handle(Channels.multicaFindByTapd, (tapdKey: string) => multica.findByTapd(tapdKey))
  handle(Channels.multicaDispatch, async (req: MulticaDispatchRequest) => {
    await registry.current().catch(() => null)
    const { item, description } = await tapd.detail(req.tapdKey)
    const tapdPrefs = prefs.get().tapd
    const tapdRepoId = item.iterationId ? tapdPrefs?.iterationRepos?.[item.iterationId] : tapdPrefs?.itemRepos?.[item.key]
    const repoId = (req.projectId ? (await multica.project(req.projectId))?.repoId : null) ?? tapdRepoId
    const repo = repoId ? registry.cachedProjects().find((p) => p.id === repoId) : undefined
    const body = dispatchDescription({ repoPath: repo?.repoPath ?? null, kind: item.kind, url: item.url, body: description })
    const result = await multica.dispatch(req, body)
    if (req.agentId) prefs.update({ multica: { lastAgentId: req.agentId } })
    return result
  })
  handle(Channels.multicaComment, async (id: string, text: string) => {
    if (!text.trim()) throw new AppError('INVALID_COMMENT', '评论不能为空')
    await multica.comment(id, text)
    return null
  })
  handle(Channels.multicaComplete, async (id: string, commit: MulticaCommitRequest | null): Promise<MulticaCompleteResult> => {
    await registry.current().catch(() => null)
    const detail = await multica.issue(id)
    const project = await issueRepo(detail.issue.repoId)
    let hash: string | null = null
    if (commit) {
      if (!project) throw new AppError('MULTICA_NO_REPO', '任务没有对应仓库，无法提交')
      hash = await git.commitFiles(project.repoPath, commit.files, commit.message)
    }
    await multica.complete(id)
    if (!project) return { card: null, commit: hash, warning: '任务没有对应仓库，未回填任务卡' }
    try {
      return { card: await backfill(detail, project), commit: hash }
    } catch (e) {
      return { card: null, commit: hash, warning: `已标为完成，但回填任务卡失败：${e instanceof Error ? e.message : String(e)}` }
    }
  })
  handle(Channels.multicaBackfill, async (id: string) => {
    await registry.current().catch(() => null)
    const detail = await multica.issue(id)
    const project = await issueRepo(detail.issue.repoId)
    if (!project) throw new AppError('MULTICA_NO_REPO', '任务没有对应仓库，请先在设置中映射 multica 项目')
    return backfill(detail, project)
  })
  handle(Channels.multicaLaunchDesktop, async () => {
    const exe = desktopExe(process.env)
    if (!existsSync(exe)) throw new AppError('MULTICA_DESKTOP_MISSING', '没有找到 multica 桌面端', exe)
    const err = await shell.openPath(exe)
    if (err) throw new AppError('MULTICA_DESKTOP_FAILED', `启动 multica 桌面端失败：${err}`)
    return null
  })

  // 加密后的令牌只在主进程使用
  handle(Channels.settingsGet, () => publicPrefs(prefs.get()))
  handle(Channels.settingsSet, async (patch: PrefsPatch) => {
    const prev = prefs.get()
    const { tapdTokenEnc: _ignored, ...safePatch } = patch
    if (safePatch.hotkey && safePatch.hotkey !== prev.hotkey) hotkey.apply(safePatch.hotkey)
    const next = prefs.update(safePatch)
    if (safePatch.multica && ('profile' in safePatch.multica || 'cliPath' in safePatch.multica)) multica.reset()
    if (next.vaultPath !== prev.vaultPath) {
      registry.watch()
      await registry.load().catch(() => undefined)
      send(Events.registryChanged)
    }
    return publicPrefs(next)
  })

  handle(Channels.appOpenExternal, async (url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new AppError('INVALID_URL', `只允许打开 http(s) 链接：${url}`)
    await shell.openExternal(url)
    return null
  })

  registry.on('changed', () => send(Events.registryChanged))
  runner.on('started', (session) => send(Events.runnerStarted, session))
  runner.on('output', (event) => send(Events.runnerOutput, event))
  runner.on('exit', (event) => send(Events.runnerExit, event))
  release.on('changed', (job: ReleaseJob) => {
    if (job.action === 'upload' && job.status === 'ok' && job.upload) {
      prefs.update({ repos: { [job.projectId]: { lastUploadVersion: job.upload.version } } })
    }
    send(Events.releaseChanged, job)
  })
}
