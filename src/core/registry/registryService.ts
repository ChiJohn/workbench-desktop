import { EventEmitter } from 'node:events'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Project, RegistryResult } from '../../shared/types'
import { AppError } from '../result'
import { parseRepoMap } from './parseRepoMap'

const MAP_FILE = '仓库映射.md'

/** 映射里的路径可能是 monorepo 中的子应用，需要向上查找 .git */
function isInsideGitRepo(path: string): boolean {
  let dir = resolve(path)
  for (;;) {
    if (existsSync(join(dir, '.git'))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

function checkAvailability(repoPath: string): Pick<Project, 'available' | 'unavailableReason'> {
  if (!existsSync(repoPath)) return { available: false, unavailableReason: '路径不存在' }
  if (!isInsideGitRepo(repoPath)) return { available: false, unavailableReason: '不在 git 仓库中' }
  return { available: true }
}

/** 事件：`changed` —— 映射文件变化并重新解析后触发 */
export class RegistryService extends EventEmitter {
  private cache: RegistryResult | null = null
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly getVaultPath: () => string,
    private readonly debounceMs = 300
  ) {
    super()
  }

  mapPath(): string {
    return join(this.getVaultPath(), 'Projects', MAP_FILE)
  }

  async load(): Promise<RegistryResult> {
    const sourcePath = this.mapPath()
    let markdown: string
    try {
      markdown = await readFile(sourcePath, 'utf8')
    } catch {
      this.cache = null
      throw new AppError('MAP_NOT_FOUND', '找不到仓库映射文件，请在设置中检查 vault 路径', sourcePath)
    }
    const { projects, skipped } = parseRepoMap(markdown)
    this.cache = {
      sourcePath,
      projects: projects.map((p) => ({ ...p, ...checkAvailability(p.repoPath) })),
      skipped
    }
    return this.cache
  }

  async current(): Promise<RegistryResult> {
    return this.cache ?? this.load()
  }

  /** 查找项目；要求项目可用（路径存在且是 git 仓库） */
  async require(id: string): Promise<Project> {
    const { projects } = await this.current()
    const project = projects.find((p) => p.id === id)
    if (!project) throw new AppError('PROJECT_NOT_FOUND', `未找到项目：${id}`)
    if (!project.available) {
      throw new AppError('PROJECT_UNAVAILABLE', `项目不可用：${project.unavailableReason}`, project.repoPath)
    }
    return project
  }

  /** 同步读取缓存中的项目名，供托盘等不便等待的场景使用 */
  nameOf(id: string): string {
    return this.cache?.projects.find((p) => p.id === id)?.name ?? id
  }

  watch(): void {
    this.unwatch()
    const dir = join(this.getVaultPath(), 'Projects')
    if (!existsSync(dir)) return
    this.watcher = watch(dir, (_event, filename) => {
      if (filename !== MAP_FILE) return
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        this.load()
          .catch(() => undefined)
          .finally(() => this.emit('changed'))
      }, this.debounceMs)
    })
    this.watcher.on('error', () => this.unwatch())
  }

  unwatch(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.watcher?.close()
    this.watcher = null
  }
}
