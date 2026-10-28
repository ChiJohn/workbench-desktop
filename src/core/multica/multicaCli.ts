import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execCommand, type ExecOptions, type ExecResult } from '../exec'
import { AppError } from '../result'

const TIMEOUT_MS = 30_000
const BODY_FILE = 'body.md'

type Env = Record<string, string | undefined>

export function desktopDir(env: Env): string {
  return join(env.LOCALAPPDATA ?? '', 'Programs', '@multicadesktop')
}

export function desktopExe(env: Env): string {
  return join(desktopDir(env), 'Multica.exe')
}

/** 设置里的路径 → 桌面端自带的 CLI → PATH 上的 multica */
export function resolveCliPath(input: { configured?: string; env: Env; exists?: (p: string) => boolean }): string {
  const exists = input.exists ?? existsSync
  if (input.configured && exists(input.configured)) return input.configured
  const bundled = join(desktopDir(input.env), 'resources', 'app.asar.unpacked', 'resources', 'bin', 'multica.exe')
  return exists(bundled) ? bundled : 'multica'
}

/** 设置里的 profile → 桌面端的 `desktop-*` profile → 默认 profile */
export function resolveProfile(input: { configured?: string; env: Env; listDir?: (p: string) => string[] }): string | undefined {
  if (input.configured) return input.configured
  const listDir =
    input.listDir ??
    ((p: string) => {
      try {
        return readdirSync(p)
      } catch {
        return []
      }
    })
  return listDir(join(input.env.USERPROFILE ?? '', '.multica', 'profiles')).find((name) => name.startsWith('desktop-'))
}

/** Go 的后量子握手包太大，这条链路上会被丢掉。CLI 和桌面端都要带上。 */
export function multicaRuntimeEnv(env: Env): Env {
  const current = env.GODEBUG ?? ''
  if (/(^|,)tlsmlkem=/.test(current)) return env
  return { ...env, GODEBUG: current ? `${current},tlsmlkem=0` : 'tlsmlkem=0' }
}

export interface MulticaCliOptions {
  resolveBin: () => string
  resolveProfile: () => string | undefined
  exec?: (file: string, args: string[], opts?: ExecOptions) => Promise<ExecResult>
  timeoutMs?: number
}

export class MulticaCli {
  constructor(private readonly opts: MulticaCliOptions) {}

  async json<T>(args: string[], opts: { workspaceId?: string; cwd?: string } = {}): Promise<T> {
    const profile = this.opts.resolveProfile()
    const full = [
      ...(profile ? ['--profile', profile] : []),
      ...(opts.workspaceId ? ['--workspace-id', opts.workspaceId] : []),
      ...args,
      '--output',
      'json'
    ]
    const timeoutMs = this.opts.timeoutMs ?? TIMEOUT_MS
    let r: ExecResult
    try {
      r = await (this.opts.exec ?? execCommand)(this.opts.resolveBin(), full, {
        cwd: opts.cwd,
        timeoutMs,
        env: multicaRuntimeEnv(process.env)
      })
    } catch (e) {
      if (e instanceof AppError && e.code === 'COMMAND_NOT_FOUND') {
        throw new AppError('MULTICA_CLI_MISSING', '没有找到 multica CLI，请安装 multica 桌面端或在设置中指定路径')
      }
      throw e
    }
    if (r.timedOut) throw new AppError('MULTICA_TIMEOUT', `multica ${args[0]} 超时（${timeoutMs / 1000} 秒）`)
    if (r.code !== 0) {
      const detail = (r.stderr || r.stdout).trim()
      if (/No server configured|not logged in|token.*(invalid|expired)/i.test(detail)) {
        throw new AppError('MULTICA_NOT_LOGGED_IN', 'multica 未登录，请先打开桌面端登录', detail)
      }
      if (r.code === 4) throw new AppError('MULTICA_NOT_FOUND', 'multica 中没有找到该对象', detail)
      const first = detail.split(/\r?\n/).find((l) => l.trim()) ?? `multica ${args[0]} 失败`
      throw new AppError('MULTICA_ERROR', `multica：${first.trim()}`, detail)
    }
    if (!r.stdout.trim()) return null as T
    try {
      return JSON.parse(r.stdout) as T
    } catch {
      throw new AppError('MULTICA_ERROR', '无法解析 multica 输出', r.stdout.slice(0, 2000))
    }
  }

  /** CLI 的 --*-file 只读工作目录内的文件：写到临时目录并作为 cwd */
  async withTempFile<T>(content: string, fn: (name: string, cwd: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'wb-multica-'))
    try {
      await writeFile(join(dir, BODY_FILE), content, 'utf8')
      return await fn(BODY_FILE, dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}
