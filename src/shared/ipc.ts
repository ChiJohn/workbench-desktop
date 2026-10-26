import type {
  BranchList,
  MulticaCommitRequest,
  MulticaCompleteResult,
  MulticaDispatchRequest,
  MulticaDispatchResult,
  MulticaIssue,
  MulticaIssueDetail,
  MulticaOverview,
  OpenerKind,
  Prefs,
  PrefsPatch,
  RegistryResult,
  ReleaseInfo,
  ReleaseJob,
  ReleaseRequest,
  ReportGenerateRequest,
  ReportKind,
  ReportMaterial,
  ReportRange,
  RepoStatus,
  Result,
  RunnerExitEvent,
  RunnerOutputEvent,
  RunSession,
  ScriptsInfo,
  TapdBoard,
  TapdDetail,
  TapdStatus,
  WorktreeChange
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
  releaseInfo: 'release.info',
  releaseStart: 'release.start',
  releaseCancel: 'release.cancel',
  releaseList: 'release.list',
  tapdStatus: 'tapd.status',
  tapdSetToken: 'tapd.setToken',
  tapdBoard: 'tapd.board',
  tapdDetail: 'tapd.detail',
  tapdTransition: 'tapd.transition',
  tapdCreateCard: 'tapd.createCard',
  tapdOpenCard: 'tapd.openCard',
  gitChanges: 'git.changes',
  gitDiff: 'git.diff',
  multicaOverview: 'multica.overview',
  multicaIssue: 'multica.issue',
  multicaFindByTapd: 'multica.findByTapd',
  multicaDispatch: 'multica.dispatch',
  multicaComment: 'multica.comment',
  multicaComplete: 'multica.complete',
  multicaBackfill: 'multica.backfill',
  multicaLaunchDesktop: 'multica.launchDesktop',
  reportCollect: 'report.collect',
  reportGenerate: 'report.generate',
  reportCancel: 'report.cancel',
  reportSave: 'report.save',
  settingsGet: 'settings.get',
  settingsSet: 'settings.set',
  appOpenExternal: 'app.openExternal'
} as const

export const Events = {
  registryChanged: 'registry:changed',
  runnerOutput: 'runner:output',
  runnerExit: 'runner:exit',
  runnerStarted: 'runner:started',
  releaseChanged: 'release:changed',
  tapdUpdated: 'tapd:updated',
  tapdFocus: 'tapd:focus',
  reportProgress: 'report:progress',
  reportOpen: 'report:open'
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
    changes(projectId: string): Promise<Result<WorktreeChange[]>>
    diff(projectId: string, path: string): Promise<Result<string>>
  }
  multica: {
    /** force 时清空元数据缓存 */
    overview(force?: boolean): Promise<Result<MulticaOverview>>
    issue(id: string): Promise<Result<MulticaIssueDetail>>
    findByTapd(tapdKey: string): Promise<Result<MulticaIssue | null>>
    dispatch(req: MulticaDispatchRequest): Promise<Result<MulticaDispatchResult>>
    comment(id: string, text: string): Promise<Result<null>>
    complete(id: string, commit: MulticaCommitRequest | null): Promise<Result<MulticaCompleteResult>>
    /** 返回任务卡的 vault 相对路径 */
    backfill(id: string): Promise<Result<string>>
    launchDesktop(): Promise<Result<null>>
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
  release: {
    info(projectId: string): Promise<Result<ReleaseInfo>>
    start(req: ReleaseRequest): Promise<Result<ReleaseJob>>
    cancel(jobId: string): Promise<Result<null>>
    list(): Promise<Result<ReleaseJob[]>>
  }
  tapd: {
    status(): Promise<Result<TapdStatus>>
    setToken(token: string | null): Promise<Result<TapdStatus>>
    /** force 时清空元数据缓存 */
    board(force?: boolean): Promise<Result<TapdBoard>>
    detail(key: string): Promise<Result<TapdDetail>>
    transition(key: string, to: string): Promise<Result<null>>
    /** 返回任务卡的 vault 相对路径 */
    createCard(key: string, projectId: string): Promise<Result<string>>
    openCard(relPath: string): Promise<Result<null>>
  }
  report: {
    collect(kind: ReportKind, range: ReportRange): Promise<Result<ReportMaterial>>
    /** 返回草稿正文；进度通过 on.reportProgress 推送 */
    generate(req: ReportGenerateRequest): Promise<Result<string>>
    cancel(): Promise<Result<null>>
    /** 返回 vault 相对路径 */
    save(kind: ReportKind, range: ReportRange, content: string): Promise<Result<string>>
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
    releaseChanged(cb: (job: ReleaseJob) => void): Unsubscribe
    tapdUpdated(cb: (board: TapdBoard) => void): Unsubscribe
    tapdFocus(cb: (key: string) => void): Unsubscribe
    reportProgress(cb: (text: string) => void): Unsubscribe
    /** 点击汇报提醒 */
    reportOpen(cb: (kind: ReportKind) => void): Unsubscribe
  }
}
