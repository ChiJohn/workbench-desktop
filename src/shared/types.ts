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
}

export interface Prefs {
  vaultPath: string
  /** Electron accelerator 格式 */
  hotkey: string
  terminal: 'wt' | 'powershell'
  /** 微信开发者工具 cli.bat 路径 */
  wechatDevtoolsCli?: string
  repos: Record<string, RepoPrefs>
}

export interface PrefsPatch extends Partial<Omit<Prefs, 'repos'>> {
  repos?: Record<string, RepoPrefs>
}
