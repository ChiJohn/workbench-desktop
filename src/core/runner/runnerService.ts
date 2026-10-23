import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { RunnerExitEvent, RunnerOutputEvent, RunSession } from '../../shared/types'
import { AppError } from '../result'
import { killTree } from './killTree'
import { LineBuffer } from './lineBuffer'
import { buildRunCommand, readScripts } from './packageScripts'

const EXIT_DRAIN_MS = 200
const MIN_AGE_BEFORE_KILL_MS = 1500

export interface StartInput {
  projectId: string
  repoPath: string
  script: string
}

export interface RunnerOptions {
  maxLines?: number
  flushMs?: number
}

interface Entry {
  session: RunSession
  buffer: LineBuffer
  child: ChildProcess
  pending: string
  timer: NodeJS.Timeout | null
}

/**
 * 事件：
 * - `started` (RunSession)
 * - `output` (RunnerOutputEvent) —— 按 flushMs 合并后推送
 * - `exit` (RunnerExitEvent)
 */
export class RunnerService extends EventEmitter {
  private readonly entries = new Map<string, Entry>()
  private readonly maxLines: number
  private readonly flushMs: number

  constructor(opts: RunnerOptions = {}) {
    super()
    this.maxLines = opts.maxLines ?? 5000
    this.flushMs = opts.flushMs ?? 50
  }

  async start({ projectId, repoPath, script }: StartInput): Promise<RunSession> {
    const duplicate = [...this.entries.values()].find(
      (e) => e.session.projectId === projectId && e.session.script === script && e.session.status === 'running'
    )
    if (duplicate) {
      throw new AppError('ALREADY_RUNNING', `${script} 已在运行`, duplicate.session.runId)
    }

    const { pm, scripts } = await readScripts(repoPath)
    if (!(script in scripts)) throw new AppError('SCRIPT_NOT_FOUND', `package.json 中没有脚本：${script}`)

    const child = spawn(buildRunCommand(pm, script), {
      cwd: repoPath,
      shell: true,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, FORCE_COLOR: '1' }
    })

    const session: RunSession = {
      runId: randomUUID(),
      projectId,
      script,
      pid: child.pid ?? -1,
      status: 'running',
      startedAt: Date.now()
    }
    const entry: Entry = { session, buffer: new LineBuffer(this.maxLines), child, pending: '', timer: null }
    this.entries.set(session.runId, entry)

    const onData = (data: string) => this.push(entry, data)
    for (const stream of [child.stdout, child.stderr]) {
      // setEncoding 会处理跨 chunk 截断的多字节字符
      stream?.setEncoding('utf8')
      stream?.on('data', onData)
    }
    child.on('error', (err) => {
      this.push(entry, `\n[启动失败] ${err.message}\n`)
      this.finish(entry, null)
    })
    child.on('close', (code) => this.finish(entry, code))
    // 残留的后代进程可能一直占着管道导致 close 不触发，以 exit 为兜底
    child.on('exit', (code) => setTimeout(() => this.finish(entry, code), EXIT_DRAIN_MS))

    this.emit('started', { ...session })
    return { ...session }
  }

  async stop(runId: string): Promise<void> {
    const entry = this.get(runId)
    if (entry.session.status !== 'running' || entry.session.pid <= 0) return
    // shell → 包管理器 → 脚本 的进程链仍在创建时 taskkill /T 会漏掉新进程
    const wait = entry.session.startedAt + MIN_AGE_BEFORE_KILL_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    await killTree(entry.session.pid)
  }

  async stopAll(): Promise<void> {
    const running = [...this.entries.values()].filter((e) => e.session.status === 'running')
    await Promise.all(running.map((e) => this.stop(e.session.runId)))
  }

  list(): RunSession[] {
    return [...this.entries.values()].map((e) => ({ ...e.session }))
  }

  buffer(runId: string): string {
    const entry = this.get(runId)
    return entry.buffer.toString()
  }

  dispose(runId: string): void {
    const entry = this.get(runId)
    if (entry.session.status === 'running') {
      throw new AppError('RUN_STILL_RUNNING', '脚本仍在运行，请先停止')
    }
    this.entries.delete(runId)
  }

  hasRunning(): boolean {
    return [...this.entries.values()].some((e) => e.session.status === 'running')
  }

  private get(runId: string): Entry {
    const entry = this.entries.get(runId)
    if (!entry) throw new AppError('RUN_NOT_FOUND', `运行实例不存在：${runId}`)
    return entry
  }

  private push(entry: Entry, chunk: string): void {
    entry.buffer.append(chunk)
    entry.pending += chunk
    if (!entry.timer) {
      entry.timer = setTimeout(() => this.flush(entry), this.flushMs)
    }
  }

  private flush(entry: Entry): void {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    if (!entry.pending) return
    const event: RunnerOutputEvent = { runId: entry.session.runId, chunk: entry.pending }
    entry.pending = ''
    this.emit('output', event)
  }

  private finish(entry: Entry, code: number | null): void {
    if (entry.session.status === 'exited') return
    this.flush(entry)
    entry.session.status = 'exited'
    entry.session.exitCode = code
    const event: RunnerExitEvent = { runId: entry.session.runId, exitCode: code }
    this.emit('exit', event)
  }
}
