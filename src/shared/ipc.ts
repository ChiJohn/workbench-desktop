import type {
  BranchList,
  OpenerKind,
  Prefs,
  PrefsPatch,
  RegistryResult,
  RepoStatus,
  Result,
  RunnerExitEvent,
  RunnerOutputEvent,
  RunSession,
  ScriptsInfo
} from './types'

export const Channels = {
  registryList: 'registry.list',
  gitStatusAll: 'git.statusAll',
  gitStatus: 'git.status',
  gitFetchAll: 'git.fetchAll',
  gitFetch: 'git.fetch',
  gitPull: 'git.pull',
  gitBranches: 'git.branches',
  gitCheckout: 'git.checkout',
  gitCreateBranch: 'git.createBranch',
  runnerScripts: 'runner.scripts',
  runnerStart: 'runner.start',
  runnerStop: 'runner.stop',
  runnerList: 'runner.list',
  runnerBuffer: 'runner.buffer',
  runnerDispose: 'runner.dispose',
  launcherOpen: 'launcher.open',
  settingsGet: 'settings.get',
  settingsSet: 'settings.set',
  appOpenExternal: 'app.openExternal'
} as const

export const Events = {
  registryChanged: 'registry:changed',
  runnerOutput: 'runner:output',
  runnerExit: 'runner:exit',
  runnerStarted: 'runner:started'
} as const

export type StatusMap = Record<string, Result<RepoStatus>>
export type FetchAllMap = Record<string, Result<null>>

type Unsubscribe = () => void

export interface WorkbenchApi {
  registry: {
    list(): Promise<Result<RegistryResult>>
  }
  git: {
    statusAll(): Promise<Result<StatusMap>>
    status(projectId: string): Promise<Result<RepoStatus>>
    fetchAll(): Promise<Result<FetchAllMap>>
    fetch(projectId: string): Promise<Result<null>>
    pull(projectId: string): Promise<Result<null>>
    branches(projectId: string): Promise<Result<BranchList>>
    checkout(projectId: string, branch: string): Promise<Result<null>>
    createBranch(projectId: string, branch: string): Promise<Result<null>>
  }
  runner: {
    scripts(projectId: string): Promise<Result<ScriptsInfo>>
    start(projectId: string, script: string): Promise<Result<RunSession>>
    stop(runId: string): Promise<Result<null>>
    list(): Promise<Result<RunSession[]>>
    buffer(runId: string): Promise<Result<string>>
    dispose(runId: string): Promise<Result<null>>
  }
  launcher: {
    open(projectId: string, opener: OpenerKind): Promise<Result<null>>
  }
  settings: {
    get(): Promise<Result<Prefs>>
    set(patch: PrefsPatch): Promise<Result<Prefs>>
  }
  app: {
    openExternal(url: string): Promise<Result<null>>
  }
  on: {
    registryChanged(cb: () => void): Unsubscribe
    runnerOutput(cb: (e: RunnerOutputEvent) => void): Unsubscribe
    runnerExit(cb: (e: RunnerExitEvent) => void): Unsubscribe
    runnerStarted(cb: (s: RunSession) => void): Unsubscribe
  }
}
