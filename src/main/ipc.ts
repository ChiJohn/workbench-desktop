import { ipcMain, shell } from 'electron'
import { mapLimit } from '../core/concurrency'
import { AppError, wrap } from '../core/result'
import { findMiniprogramRoot } from '../core/launcher/launcherService'
import { buildReleaseInfo } from '../core/release/releaseInfo'
import { readScripts } from '../core/runner/packageScripts'
import { Channels, Events, type FetchAllMap, type StatusMap } from '../shared/ipc'
import type { OpenerKind, PrefsPatch, Project, ReleaseJob, ReleaseRequest } from '../shared/types'
import type { HotkeyManager } from './hotkey'
import type { Services } from './services'

const STATUS_CONCURRENCY = 6
const FETCH_CONCURRENCY = 4

export interface IpcDeps {
  services: Services
  hotkey: HotkeyManager
  send(channel: string, payload?: unknown): void
}

function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args) => wrap(() => fn(...args)))
}

async function availableProjects({ registry }: Services): Promise<Project[]> {
  const { projects } = await registry.current()
  return projects.filter((p) => p.available)
}

export function registerIpc({ services, hotkey, send }: IpcDeps): void {
  const { registry, git, runner, launcher, prefs, release } = services
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

  handle(Channels.settingsGet, () => prefs.get())
  handle(Channels.settingsSet, async (patch: PrefsPatch) => {
    const prev = prefs.get()
    if (patch.hotkey && patch.hotkey !== prev.hotkey) hotkey.apply(patch.hotkey)
    const next = prefs.update(patch)
    if (next.vaultPath !== prev.vaultPath) {
      registry.watch()
      await registry.load().catch(() => undefined)
      send(Events.registryChanged)
    }
    return next
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
