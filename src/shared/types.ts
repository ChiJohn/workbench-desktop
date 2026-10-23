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
  repos: Record<string, RepoPrefs>
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
