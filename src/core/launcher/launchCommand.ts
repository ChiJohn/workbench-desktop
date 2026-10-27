import type { OpenerKind, Prefs } from '../../shared/types'
import { AppError } from '../result'

export interface LaunchContext {
  repoPath: string
  terminal: Prefs['terminal']
  wechatDevtoolsCli?: string
  miniprogramRoot?: string
}

const quote = (p: string) => `"${p}"`

/** 生成交给 cmd 执行的命令行；Windows 路径中不会出现双引号 */
export function buildLaunchCommand(opener: OpenerKind, ctx: LaunchContext): string {
  switch (opener) {
    case 'cursor':
      // Cursor 3 默认是 Glass。--classic 打开原来的 IDE 窗口。
      return `cursor --classic ${quote(ctx.repoPath)}`
    case 'explorer':
      return `explorer ${quote(ctx.repoPath)}`
    case 'terminal':
      if (ctx.terminal === 'powershell') {
        const psPath = ctx.repoPath.replace(/'/g, "''")
        return `start "" powershell -NoExit -Command "Set-Location -LiteralPath '${psPath}'"`
      }
      return `wt -d ${quote(ctx.repoPath)}`
    case 'wechat':
      if (!ctx.wechatDevtoolsCli) {
        throw new AppError('WECHAT_CLI_NOT_CONFIGURED', '请先在设置中配置微信开发者工具 cli.bat 路径')
      }
      return `${quote(ctx.wechatDevtoolsCli)} open --project ${quote(ctx.miniprogramRoot ?? ctx.repoPath)}`
  }
}
