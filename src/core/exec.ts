import { execFile } from 'node:child_process'
import { AppError } from './result'

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface ExecOptions {
  cwd?: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}

export function execCommand(file: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        env: opts.env,
        timeout: opts.timeoutMs ?? 0,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr, timedOut: false })
          return
        }
        const err = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string }
        if (err.code === 'ENOENT') {
          reject(new AppError('COMMAND_NOT_FOUND', `找不到命令：${file}`, file))
          return
        }
        resolve({
          code: typeof err.code === 'number' ? err.code : null,
          stdout,
          stderr,
          timedOut: Boolean(err.killed)
        })
      }
    )
  })
}
