import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenerKind } from '../../shared/types'
import { execCommand } from '../exec'
import { AppError } from '../result'
import { buildLaunchCommand, type LaunchContext } from './launchCommand'

const SKIP_DIRS = new Set(['node_modules', '.git'])

/** 需要在 PATH 中存在的命令；explorer / start 为系统内置 */
function requiredBin(opener: OpenerKind, ctx: LaunchContext): string | null {
  if (opener === 'cursor') return 'cursor'
  if (opener === 'terminal' && ctx.terminal === 'wt') return 'wt'
  return null
}

/** cmd 对不存在的命令与正常程序可能返回相同的退出码，因此启动前用 where 检查 */
export async function ensureCommand(bin: string): Promise<void> {
  const r = await execCommand('where.exe', [bin], { timeoutMs: 5000 })
  if (r.code !== 0) throw new AppError('COMMAND_NOT_FOUND', `找不到命令：${bin}，请确认已安装并加入 PATH`, bin)
}

export function runDetached(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', (err) => reject(new AppError('LAUNCH_FAILED', `启动失败：${err.message}`, command)))
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export async function findMiniprogramRoot(repoPath: string): Promise<string> {
  if (existsSync(join(repoPath, 'project.config.json'))) return repoPath
  const entries = await readdir(repoPath, { withFileTypes: true }).catch(() => [])
  const dirs = entries
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
  const found = dirs.find((d) => existsSync(join(repoPath, d, 'project.config.json')))
  return found ? join(repoPath, found) : repoPath
}

export class LauncherService {
  async open(opener: OpenerKind, ctx: LaunchContext): Promise<void> {
    const bin = requiredBin(opener, ctx)
    if (bin) await ensureCommand(bin)
    if (opener === 'wechat' && ctx.wechatDevtoolsCli && !existsSync(ctx.wechatDevtoolsCli)) {
      throw new AppError('WECHAT_CLI_NOT_FOUND', '微信开发者工具 cli.bat 路径不存在，请在设置中修改', ctx.wechatDevtoolsCli)
    }
    const miniprogramRoot =
      opener === 'wechat' ? (ctx.miniprogramRoot ?? (await findMiniprogramRoot(ctx.repoPath))) : undefined
    await runDetached(buildLaunchCommand(opener, { ...ctx, miniprogramRoot }))
  }
}
