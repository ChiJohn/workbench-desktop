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
  Project,
  ProjectType,
  ProjectWriteRequest,
  CloneProgress,
  CloneRequest,
  RegistryResult,
  ReleaseInfo,
  ReleaseJob,
  ReleaseRequest,
  ReportGenerateRequest,
  ReportKind,
  ReportMaterial,
  ReportRange,
  KnowledgeAnswer,
  KnowledgeAskRequest,
  KnowledgeDraft,
  KnowledgeDraftRequest,
  KnowledgeSaveRequest,
  KnowledgeSearchGroup,
  AssistantContext,
  AssistantTurn,
  RepoStatus,
  Result,
  RunnerExitEvent,
  RunnerOutputEvent,
  RunSession,
  ShellBuffer,
  ShellExitEvent,
  ShellOutputEvent,
  ShellSession,
  ScriptsInfo,
  TapdBoard,
  TapdDetail,
  TapdStatus,
  AlignState,
  VaultInitResult,
  WorktreeChange,
  TodoItem
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
  shellOpen: 'shell.open',
  shellWrite: 'shell.write',
  shellResize: 'shell.resize',
  shellClose: 'shell.close',
  shellList: 'shell.list',
  shellBuffer: 'shell.buffer',
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
  apifoxStatus: 'apifox.status',
  apifoxSetToken: 'apifox.setToken',
  alignList: 'align.list',
  alignAdd: 'align.add',
  alignRefresh: 'align.refresh',
  alignRemove: 'align.remove',
  alignRename: 'align.rename',
  alignMcpSnippet: 'align.mcpSnippet',
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
  knowledgeAsk: 'knowledge.ask',
  knowledgeCancel: 'knowledge.cancel',
  knowledgeSearch: 'knowledge.search',
  knowledgeDraft: 'knowledge.draft',
  knowledgeSave: 'knowledge.save',
  assistantSend: 'assistant.send',
  assistantConfirm: 'assistant.confirm',
  assistantCancel: 'assistant.cancel',
  projectAdd: 'project.add',
  projectUpdate: 'project.update',
  projectRemove: 'project.remove',
  projectDetectType: 'project.detectType',
  projectClone: 'project.clone',
  projectCancelClone: 'project.cancelClone',
  settingsGet: 'settings.get',
  settingsSet: 'settings.set',
  vaultInit: 'vault.init',
  appPickFolder: 'app.pickFolder',
  appOpenExternal: 'app.openExternal',
  stickyNoteRead: 'stickyNote.read',
  stickyNoteWrite: 'stickyNote.write',
  todoList: 'todo.list',
  todoAdd: 'todo.add',
  todoToggle: 'todo.toggle',
  todoRemove: 'todo.remove',
  todoDispatch: 'todo.dispatch'
} as const

export const Events = {
  registryChanged: 'registry:changed',
  runnerOutput: 'runner:output',
  runnerExit: 'runner:exit',
  runnerStarted: 'runner:started',
  shellOutput: 'shell:output',
  shellExit: 'shell:exit',
  releaseChanged: 'release:changed',
  tapdUpdated: 'tapd:updated',
  tapdFocus: 'tapd:focus',
  reportProgress: 'report:progress',
  reportOpen: 'report:open',
  knowledgeProgress: 'knowledge:progress',
  assistantProgress: 'assistant:progress',
  projectCloneProgress: 'project:cloneProgress'
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
  shell: {
    /** projectId 为空时在用户目录打开 */
    open(projectId: string | null, cols: number, rows: number): Promise<Result<ShellSession>>
    write(id: string, data: string): Promise<Result<null>>
    resize(id: string, cols: number, rows: number): Promise<Result<null>>
    close(id: string): Promise<Result<null>>
    list(): Promise<Result<ShellSession[]>>
    buffer(id: string): Promise<Result<ShellBuffer>>
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
  apifox: {
    status(): Promise<Result<TapdStatus>>
    setToken(token: string | null): Promise<Result<TapdStatus>>
  }
  align: {
    list(tapdKey: string): Promise<Result<AlignState>>
    add(tapdKey: string, url: string): Promise<Result<AlignState>>
    refresh(tapdKey: string, url: string): Promise<Result<AlignState>>
    remove(tapdKey: string, urlOrTarget: string): Promise<Result<AlignState>>
    rename(tapdKey: string, url: string, name: string): Promise<Result<AlignState>>
    /** 不含令牌的 Cursor MCP 配置片段 */
    mcpSnippet(projectId: string): Promise<Result<string>>
  }
  report: {
    collect(kind: ReportKind, range: ReportRange): Promise<Result<ReportMaterial>>
    /** 返回草稿正文；进度通过 on.reportProgress 推送 */
    generate(req: ReportGenerateRequest): Promise<Result<string>>
    cancel(): Promise<Result<null>>
    /** 返回 vault 相对路径 */
    save(kind: ReportKind, range: ReportRange, content: string): Promise<Result<string>>
  }
  knowledge: {
    ask(req: KnowledgeAskRequest): Promise<Result<KnowledgeAnswer>>
    cancel(): Promise<Result<null>>
    search(query: string, project?: string): Promise<Result<KnowledgeSearchGroup[]>>
    draft(req: KnowledgeDraftRequest): Promise<Result<KnowledgeDraft>>
    save(req: KnowledgeSaveRequest): Promise<Result<string>>
  }
  assistant: {
    send(text: string, context: AssistantContext): Promise<Result<AssistantTurn>>
    confirm(): Promise<Result<AssistantTurn>>
    cancel(): Promise<Result<AssistantTurn>>
  }
  project: {
    add(req: ProjectWriteRequest): Promise<Result<Project>>
    update(id: string, req: ProjectWriteRequest): Promise<Result<Project>>
    remove(id: string): Promise<Result<null>>
    detectType(dir: string): Promise<Result<ProjectType>>
    clone(req: CloneRequest): Promise<Result<null>>
    cancelClone(): Promise<Result<null>>
  }
  settings: {
    get(): Promise<Result<Prefs>>
    set(patch: PrefsPatch): Promise<Result<Prefs>>
  }
  vault: {
    /** 建好目录骨架，不覆盖已有文件，并把 vault 路径切到这里 */
    init(path: string): Promise<Result<VaultInitResult>>
  }
  app: {
    openExternal(url: string): Promise<Result<null>>
    /** 取消时返回 null */
    pickFolder(defaultPath?: string): Promise<Result<string | null>>
  }
  stickyNote: {
    read(): Promise<Result<string>>
    write(text: string): Promise<Result<null>>
  }
  todo: {
    list(): Promise<Result<TodoItem[]>>
    add(text: string): Promise<Result<TodoItem[]>>
    toggle(id: string): Promise<Result<TodoItem[]>>
    remove(id: string): Promise<Result<TodoItem[]>>
    /** 返回派单后的列表 */
    dispatch(req: { id: string; title: string; projectId: string | null; agentId: string | null }): Promise<Result<TodoItem[]>>
  }
  on: {
    registryChanged(cb: () => void): Unsubscribe
    runnerOutput(cb: (e: RunnerOutputEvent) => void): Unsubscribe
    runnerExit(cb: (e: RunnerExitEvent) => void): Unsubscribe
    runnerStarted(cb: (s: RunSession) => void): Unsubscribe
    shellOutput(cb: (e: ShellOutputEvent) => void): Unsubscribe
    shellExit(cb: (e: ShellExitEvent) => void): Unsubscribe
    releaseChanged(cb: (job: ReleaseJob) => void): Unsubscribe
    tapdUpdated(cb: (board: TapdBoard) => void): Unsubscribe
    tapdFocus(cb: (key: string) => void): Unsubscribe
    reportProgress(cb: (text: string) => void): Unsubscribe
    /** 点击汇报提醒 */
    reportOpen(cb: (kind: ReportKind) => void): Unsubscribe
    knowledgeProgress(cb: (text: string) => void): Unsubscribe
    assistantProgress(cb: (text: string) => void): Unsubscribe
    projectCloneProgress(cb: (progress: CloneProgress) => void): Unsubscribe
  }
}
