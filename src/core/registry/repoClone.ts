import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { killTree } from '../runner/killTree'
import { AppError } from '../result'
import { repoNameFromUrl } from '../../shared/repoUrl'
import type { CloneProgress } from '../../shared/types'

export interface CloneProcess {
  pid?: number
  stdout: { on(event: 'data', cb: (chunk: Buffer) => void): void } | null
  stderr: { on(event: 'data', cb: (chunk: Buffer) => void): void } | null
  on(event: 'close', cb: (code: number | null) => void): void
  on(event: 'error', cb: (err: Error) => void): void
}

interface CloneDeps {
  spawn(command: string, args: string[], env: NodeJS.ProcessEnv): CloneProcess
  /** 目录不存在返回 null；是文件时返回非空数组 */
  list(path: string): Promise<string[] | null>
  mkdir(path: string): Promise<void>
  rm(path: string): Promise<void>
  kill(pid: number): Promise<void>
}

const defaultDeps: CloneDeps = {
  spawn: (command, args, env) =>
    spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) as ChildProcess,
  list: async (path) => {
    try {
      return await readdir(path)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return null
      if (code === 'ENOTDIR') return [path]
      throw e
    }
  },
  mkdir: async (path) => {
    await mkdir(path, { recursive: true })
  },
  rm: (path) => rm(path, { recursive: true, force: true }),
  kill: killTree
}

export function parseCloneProgress(line: string): CloneProgress | null {
  const text = line.trim()
  if (!text) return null
  const receiving = text.match(/Receiving objects:\s+(\d+)%/)
  if (receiving) return { phase: 'receiving', percent: Number(receiving[1]), line: text }
  const resolving = text.match(/Resolving deltas:\s+(\d+)%/)
  if (resolving) return { phase: 'resolving', percent: Number(resolving[1]), line: text }
  return { phase: 'other', line: text }
}

export function cloneError(output: string): AppError {
  const detail = output.trim().split(/\r?\n/).slice(-8).join('\n')
  if (/Authentication failed|could not read Username|Permission denied \(publickey\)/i.test(output)) {
    return new AppError('CLONE_AUTH', '需要登录，请先在终端里配好 git 凭据', detail)
  }
  return new AppError('CLONE_FAILED', '克隆失败', detail)
}

interface Job {
  dest: string
  created: boolean
  cancelled: boolean
  pid?: number
}

/** 同时只跑一个 git clone。失败或取消时，只删除这次新建的目录 */
export class RepoClone {
  private job: Job | null = null

  constructor(private readonly deps: CloneDeps = defaultDeps) {}

  async clone(url: string, dest: string, onProgress: (progress: CloneProgress) => void = () => undefined): Promise<void> {
    if (this.job) throw new AppError('CLONE_BUSY', '已有克隆在进行')
    const remote = url.trim()
    if (!repoNameFromUrl(remote)) throw new AppError('CLONE_URL_INVALID', '无法识别的仓库地址')
    const target = dest.trim()
    if (!target) throw new AppError('CLONE_FAILED', '请填写目标目录')

    const entries = await this.deps.list(target)
    if (entries && entries.length > 0) throw new AppError('CLONE_DEST_EXISTS', '目标目录已存在且不是空目录', target)
    const created = entries === null
    if (created) await this.deps.mkdir(dirname(target))

    const child = this.deps.spawn('git', ['clone', '--progress', remote, target], { ...process.env, GIT_TERMINAL_PROMPT: '0' })
    const job: Job = { dest: target, created, cancelled: false, pid: child.pid }
    this.job = job
    let output = ''
    const take = (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      for (const line of text.split(/\r\n|\n|\r/)) {
        const progress = parseCloneProgress(line)
        if (progress) onProgress(progress)
      }
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)

    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', (exit) => resolve(exit))
      })
      if (job.cancelled && code !== 0) {
        throw new AppError('CLONE_CANCELLED', created ? '已取消，并清理了新建的目录' : '已取消')
      }
      if (code !== 0) throw cloneError(output)
    } catch (e) {
      if (created) await this.deps.rm(target).catch(() => undefined)
      if (e instanceof AppError) throw e
      throw new AppError('CLONE_FAILED', '克隆失败', e instanceof Error ? e.message : String(e))
    } finally {
      if (this.job === job) this.job = null
    }
  }

  async cancel(): Promise<void> {
    const job = this.job
    if (!job?.pid) return
    job.cancelled = true
    await this.deps.kill(job.pid)
  }
}
