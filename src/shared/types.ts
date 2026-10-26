export interface AppErrorInfo {
  code: string
  message: string
  detail?: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorInfo }

export type ProjectType = 'miniapp' | 'h5' | 'admin' | 'pc' | 'cli' | 'other'

export interface Project {
  /** 规范化后的仓库路径 */
  id: string
  name: string
  obsidianLink: string
  repoPath: string
  type: ProjectType
  note: string
  /** 路径存在且是 git 仓库 */
  available: boolean
  unavailableReason?: string
}

export interface SkippedRow {
  line: number
  raw: string
  reason: string
}

export interface RegistryResult {
  sourcePath: string
  projects: Project[]
  skipped: SkippedRow[]
}

export interface LastCommit {
  hash: string
  subject: string
  /** 提交时间，毫秒时间戳 */
  timestamp: number
}

export interface RepoStatus {
  /** detached HEAD 时为 null */
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  changes: number
  lastCommit: LastCommit | null
}

export interface BranchList {
  current: string | null
  local: string[]
}

export type PackageManager = 'pnpm' | 'yarn' | 'npm'

export interface ScriptsInfo {
  pm: PackageManager
  scripts: Record<string, string>
}

export interface RunSession {
  runId: string
  projectId: string
  script: string
  pid: number
  status: 'running' | 'exited'
  exitCode?: number | null
  startedAt: number
}

export interface RunnerOutputEvent {
  runId: string
  chunk: string
}

export interface RunnerExitEvent {
  runId: string
  exitCode: number | null
}

export type OpenerKind = 'cursor' | 'terminal' | 'explorer' | 'wechat'

export interface RepoPrefs {
  pinned?: boolean
  favoriteScripts?: string[]
  /** 列表中双击项目时使用 */
  defaultOpener?: OpenerKind
  /** 覆盖自动探测的小程序根目录 */
  miniprogramRoot?: string
  /** 构建脚本名 → 别名 / 隐藏 */
  releaseEnvs?: Record<string, ReleaseEnvOverride>
  lastUploadVersion?: string
}

export interface ReleaseEnvOverride {
  label?: string
  hidden?: boolean
}

export interface Prefs {
  vaultPath: string
  /** Electron accelerator 格式 */
  hotkey: string
  terminal: 'wt' | 'powershell'
  /** 微信开发者工具 cli.bat 路径 */
  wechatDevtoolsCli?: string
  /** 开发者工具「安全设置」中的 CLI 访问令牌 */
  wechatDevtoolsToken?: string
  /** safeStorage 加密后的 TAPD 个人令牌（base64），不下发给渲染层 */
  tapdTokenEnc?: string
  tapd?: TapdPrefs
  multica?: MulticaPrefs
  report?: ReportPrefs
  repos: Record<string, RepoPrefs>
}

export type ReportKind = 'daily' | 'weekly' | 'monthly'
export type ReportWriter = 'claude' | 'cursor'

export interface ReportPrefs {
  /** git 作者（匹配 user.name / email），默认 git config user.name */
  authors?: string[]
  /** 月报文件名中的姓名，默认 TAPD 昵称 */
  displayName?: string
  writer?: ReportWriter
  claudePath?: string
  cursorAgentPath?: string
  /** `类型:开始日期` → 手动补充；空字符串表示删除 */
  notes?: Record<string, string>
  reminders?: ReportReminderPrefs
}

export interface ReportReminderPrefs {
  enabled?: boolean
  /** HH:mm */
  daily?: string
  weekly?: string
  monthly?: string
}

/** 包含首尾的本地日期 YYYY-MM-DD */
export interface ReportRange {
  start: string
  end: string
}

export type ReportSource = 'git' | 'tapd' | 'multica' | 'cards'

export interface ReportEntry {
  /** 稳定 id，用于排除 */
  id: string
  source: ReportSource
  /** 分组名：项目 / TAPD 项目 */
  group: string
  title: string
  detail?: string
  /** 本地时间 YYYY-MM-DD HH:mm */
  time: string
  url?: string
}

export interface ReportSourceResult {
  source: ReportSource
  entries: ReportEntry[]
  error?: string
}

export interface ReportMaterial {
  kind: ReportKind
  range: ReportRange
  sources: ReportSourceResult[]
  /** 已有报告：vault 相对路径与内容（日报为小节内容） */
  existing: { path: string; content: string } | null
  collectedAt: number
}

export interface ReportGenerateRequest {
  kind: ReportKind
  range: ReportRange
  entries: ReportEntry[]
  notes: string
}

export interface MulticaPrefs {
  cliPath?: string
  profile?: string
  workspaceId?: string
  /** multica 项目 id → 仓库项目 id；空字符串表示删除 */
  projectMap?: Record<string, string>
  lastAgentId?: string
}

export type MulticaAssigneeType = 'agent' | 'member' | 'squad'

export interface MulticaIssue {
  id: string
  identifier: string
  title: string
  status: string
  assigneeType: MulticaAssigneeType | null
  assigneeId: string | null
  assigneeName: string | null
  projectId: string | null
  projectTitle: string | null
  /** 对应的仓库项目 id */
  repoId: string | null
  updatedAt: string
  url: string
  tapdKey: string | null
}

export interface MulticaAgent {
  id: string
  name: string
}

export interface MulticaProject {
  id: string
  title: string
  repoId: string | null
  matchedBy: 'manual' | 'path' | 'name' | null
}

export interface MulticaRuntime {
  id: string
  name: string
  provider: string
  online: boolean
}

export interface MulticaWorkspace {
  id: string
  name: string
  slug: string
}

export interface MulticaOverview {
  workspace: MulticaWorkspace
  workspaces: MulticaWorkspace[]
  /** null 表示读取守护进程状态失败 */
  daemon: { running: boolean; runningTasks: number } | null
  /** 本机守护进程注册的运行时 */
  runtimes: MulticaRuntime[]
  agents: MulticaAgent[]
  projects: MulticaProject[]
  /** 未完成（backlog / todo / in_progress / in_review / blocked） */
  issues: MulticaIssue[]
  fetchedAt: number
}

export interface MulticaComment {
  id: string
  authorType: string
  authorName: string
  content: string
  createdAt: string
}

export interface MulticaIssueDetail {
  issue: MulticaIssue
  description: string
  comments: MulticaComment[]
  /** 最后一条智能体评论 */
  conclusion: string | null
  /** 已有任务卡的 vault 相对路径 */
  card: string | null
}

export interface MulticaDispatchRequest {
  tapdKey: string
  title: string
  /** multica 项目 id；null 表示不归属项目 */
  projectId: string | null
  /** null 表示暂不指派 */
  agentId: string | null
}

export interface MulticaDispatchResult {
  issue: MulticaIssue
  /** metadata 写入失败等非致命问题 */
  warning?: string
}

export interface MulticaCommitRequest {
  files: string[]
  message: string
}

export interface MulticaCompleteResult {
  card: string | null
  commit: string | null
  /** 回填失败等非致命问题 */
  warning?: string
}

export interface WorktreeChange {
  path: string
  /** porcelain v1 的两位状态码，如 ` M`、`??` */
  code: string
}

export interface TapdPrefs {
  disabledWorkspaces?: string[]
  /** 迭代 id → 仓库项目 id */
  iterationRepos?: Record<string, string>
  /** 无迭代的单子 key → 仓库项目 id */
  itemRepos?: Record<string, string>
}

export type TapdKind = 'story' | 'bug' | 'task'

export interface TapdItem {
  /** `${kind}:${id}` */
  key: string
  kind: TapdKind
  id: string
  workspaceId: string
  workspaceName: string
  title: string
  status: string
  statusLabel: string
  iterationId: string | null
  iterationName: string | null
  owners: string[]
  priority: string | null
  modified: string
  url: string
  /** 任务所属需求 */
  storyId?: string
  workitemTypeId?: string
}

export interface TapdWorkspace {
  id: string
  name: string
  enabled: boolean
}

export interface TapdBoard {
  user: string
  items: TapdItem[]
  workspaces: TapdWorkspace[]
  errors: { workspaceId: string; workspaceName: string; message: string }[]
  fetchedAt: number
}

export interface TapdTransition {
  to: string
  label: string
  /** 需要在 TAPD 中填写的必填字段；非空时不能在工作台流转 */
  blockedBy: string[]
}

export interface TapdDetail {
  item: TapdItem
  description: string
  transitions: TapdTransition[]
  /** 已生成的任务卡（vault 相对路径） */
  card: string | null
}

export interface TapdStatus {
  hasToken: boolean
  /** 令牌来源说明，如「从 ~/.cursor/mcp.json 导入」 */
  source?: string
}

export type ReleaseAction = 'preview' | 'upload'

export type BuildChoice = { kind: 'script'; script: string } | { kind: 'npm' } | { kind: 'skip' }

export interface ReleaseEnv {
  script: string
  label: string
  hidden: boolean
}

export interface ReleaseInfo {
  /** 小程序根目录（含 project.config.json） */
  root: string
  /** 没有 build:weapp* 脚本，按原生项目处理（构建步骤为构建 npm） */
  native: boolean
  envs: ReleaseEnv[]
  /** 当前产物（或根目录）project.config.json 中的 appid */
  appid: string | null
  defaultVersion: string
  defaultDesc: string
  branch: string | null
  commit: LastCommit | null
  changes: number
}

export interface ReleaseRequest {
  projectId: string
  action: ReleaseAction
  build: BuildChoice
  version?: string
  desc?: string
  /** 确认上传时看到的 appid，构建后复核 */
  expectedAppid?: string | null
}

export type StepStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped' | 'cancelled'

export type StepKind = 'build' | 'build-npm' | 'preview' | 'upload'

export interface ReleaseStep {
  kind: StepKind
  label: string
  status: StepStatus
  runId?: string
  startedAt?: number
  finishedAt?: number
}

export interface ReleaseJob {
  jobId: string
  projectId: string
  action: ReleaseAction
  status: 'running' | 'ok' | 'failed' | 'cancelled'
  steps: ReleaseStep[]
  startedAt: number
  finishedAt?: number
  appid?: string | null
  qrDataUrl?: string
  qrAt?: number
  /** 来自 --info-output 的 size.total */
  packageSize?: number
  upload?: { version: string; desc: string }
  error?: AppErrorInfo
}

export interface PrefsPatch extends Partial<Omit<Prefs, 'repos'>> {
  repos?: Record<string, RepoPrefs>
}
