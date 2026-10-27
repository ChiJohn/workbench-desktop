import { spawn, type IPty } from 'node-pty'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { ShellExitEvent, ShellOutputEvent, ShellSession } from '../shared/types'
import { shellProgram } from '../core/shell/launch'
import { killTree } from '../core/runner/killTree'
import { AppError } from '../core/result'
import type { Services } from './services'

const MAX_SHELLS = 8
const BUFFER_CAP = 200_000
const FLUSH_MS = 16

interface Entry {
  session: ShellSession
  pty: IPty
  buffer: string
  pending: string
  seq: number
  timer: NodeJS.Timeout | null
}

/**
 * 事件：
 * - `output` (ShellOutputEvent)
 * - `exit` (ShellExitEvent)
 */
export class ShellHost extends EventEmitter {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly services: Services) {
    super()
  }

  async open(projectId: string | null, cols: number, rows: number): Promise<ShellSession> {
    if (this.entries.size >= MAX_SHELLS) throw new AppError('SHELL_LIMIT', `最多同时开 ${MAX_SHELLS} 个终端`)
    const { cwd, title } = await this.place(projectId)
    const program = shellProgram()
    let pty: IPty
    try {
      pty = spawn(program.file, program.args, {
        name: 'xterm-256color',
        cols: clampDim(cols),
        rows: clampDim(rows),
        cwd,
        env: shellEnv(),
        useConpty: process.platform === 'win32'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new AppError('SHELL_START', `终端没有打开：${message}`)
    }

    const session: ShellSession = {
      id: randomUUID(),
      title: this.uniqueTitle(title),
      cwd,
      pid: pty.pid,
      status: 'running',
      exitCode: null
    }
    const entry: Entry = { session, pty, buffer: '', pending: '', seq: 0, timer: null }
    this.entries.set(session.id, entry)
    pty.onData((data) => this.push(entry, data))
    pty.onExit(({ exitCode }) => this.finish(entry, exitCode))
    return { ...session }
  }

  write(id: string, data: string): void {
    const entry = this.get(id)
    if (entry.session.status !== 'running') throw new AppError('SHELL_CLOSED', '这个终端已经退出')
    entry.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.entries.get(id)
    if (!entry || entry.session.status !== 'running') return
    try {
      entry.pty.resize(clampDim(cols), clampDim(rows))
    } catch {
      // 进程刚退出时 resize 会失败
    }
  }

  close(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    // 先让出名额。Windows 上 pty.kill 经常不触发 onExit，否则关掉的终端会一直占着上限。
    this.entries.delete(id)
    this.dropTimer(entry)
    if (entry.session.status !== 'running') return
    entry.session.status = 'exited'
    entry.session.exitCode = null
    try {
      entry.pty.kill()
    } catch {
      // 进程已经没了
    }
    void killTree(entry.session.pid)
  }

  list(): ShellSession[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.session }))
  }

  buffer(id: string): { text: string; seq: number } {
    const entry = this.get(id)
    return { text: entry.buffer, seq: entry.seq }
  }

  killAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.session.status !== 'running') continue
      try {
        entry.pty.kill()
      } catch {
        // 进程已经没了
      }
    }
  }

  private async place(projectId: string | null): Promise<{ cwd: string; title: string }> {
    if (!projectId) return { cwd: homedir(), title: '终端' }
    const { projects } = await this.services.registry.current()
    const project = projects.find((item) => item.id === projectId)
    if (!project) throw new AppError('PROJECT_NOT_FOUND', '没有这个项目')
    if (!project.available || !existsSync(project.repoPath)) throw new AppError('REPO_MISSING', '仓库目录不存在，终端没法在里面打开')
    return { cwd: project.repoPath, title: project.name }
  }

  private uniqueTitle(title: string): string {
    const used = new Set([...this.entries.values()].map((entry) => entry.session.title))
    if (!used.has(title)) return title
    let n = 2
    while (used.has(`${title} ${n}`)) n += 1
    return `${title} ${n}`
  }

  private get(id: string): Entry {
    const entry = this.entries.get(id)
    if (!entry) throw new AppError('SHELL_NOT_FOUND', '这个终端已经关掉了')
    return entry
  }

  private push(entry: Entry, chunk: string): void {
    entry.buffer = cap(entry.buffer + chunk)
    entry.pending += chunk
    if (!entry.timer) entry.timer = setTimeout(() => this.flush(entry), FLUSH_MS)
  }

  private flush(entry: Entry): void {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    if (!entry.pending) return
    entry.seq += 1
    const event: ShellOutputEvent = { id: entry.session.id, chunk: entry.pending, seq: entry.seq }
    entry.pending = ''
    this.emit('output', event)
  }

  private dropTimer(entry: Entry): void {
    if (!entry.timer) return
    clearTimeout(entry.timer)
    entry.timer = null
    entry.pending = ''
  }

  private finish(entry: Entry, exitCode: number | null): void {
    if (entry.session.status === 'exited') return
    this.flush(entry)
    entry.session.status = 'exited'
    entry.session.exitCode = exitCode
    const event: ShellExitEvent = { id: entry.session.id, exitCode }
    this.emit('exit', event)
  }
}

function clampDim(value: number): number {
  if (!Number.isFinite(value)) return 24
  return Math.max(2, Math.min(500, Math.floor(value)))
}

function cap(text: string): string {
  return text.length <= BUFFER_CAP ? text : text.slice(text.length - BUFFER_CAP)
}

function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  env.TERM = 'xterm-256color'
  return env
}
